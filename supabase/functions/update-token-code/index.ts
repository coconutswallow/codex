/**
 * @file index.ts
 * @description Supabase Edge Function to generate Avrae token codes from OTFBM metadata
 * and update the CCS_tokens table in the database.
 * If automatic token generation fails, falls back gracefully to manual input mode.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    let payload: { record_id?: string; image_url?: string } = {};
    try {
        payload = await req.json();
    } catch (e) {
        console.error("Failed to parse JSON body", e);
        return new Response(JSON.stringify({ error: "Invalid JSON" }), { headers: corsHeaders, status: 400 });
    }

    const { record_id, image_url } = payload;

    if (!record_id || !image_url) {
        return new Response(
            JSON.stringify({ error: 'Missing record_id or image_url' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
    }

    const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    try {
        console.log(`Processing token generation for record ${record_id}: ${image_url}`);

        // Validate basic URL scheme before requesting
        try {
            const parsedUrl = new URL(image_url);
            if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
                throw new Error(`Invalid URL protocol: ${parsedUrl.protocol}`);
            }
        } catch (urlErr) {
            throw new Error(`Invalid image URL format: ${urlErr.message}`);
        }

        // --- Scrape Logic ---
        const base64Url = btoa(image_url);
        const targetUrl = `https://token.otfbm.io/meta/${base64Url}`;

        const apiRes = await fetch(targetUrl, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://google.com'
            }
        });

        if (!apiRes.ok) throw new Error(`OTFBM returned status ${apiRes.status}`);

        const htmlText = await apiRes.text();
        let cleanCode = "";

        const parts = htmlText.split('<body>');
        if (parts.length > 1) {
            cleanCode = parts[1].split('</body>')[0].trim();
        } else {
            cleanCode = htmlText.trim();
        }

        if (cleanCode.length > 8 || cleanCode.length === 0) {
            console.warn("Invalid or empty code found. Resetting to empty for manual entry.");
            cleanCode = "";
        }

        // --- Database Update (Success) ---
        const { error: updateError } = await supabase
            .from('CCS_tokens')
            .update({ token_code: cleanCode })
            .eq('id', record_id);

        if (updateError) throw updateError;

        return new Response(
            JSON.stringify({ success: true, code: cleanCode }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );

    } catch (error) {
        console.error("Token Generation Warning/Error:", error.message);

        // --- Fail-Safe ---
        // Update DB to empty string so user gets the Manual Input field
        try {
            await supabase.from('CCS_tokens').update({ token_code: "" }).eq('id', record_id);
            console.log("Fail-safe: Reset token_code to empty string in CCS_tokens.");
        } catch (dbError) {
            console.error("Fail-safe DB update failed:", dbError);
        }

        // Return status 200 with code: "" so front-end UI smoothly switches to manual edit mode without 500 error
        return new Response(
            JSON.stringify({ success: false, code: "", error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
    }
});
