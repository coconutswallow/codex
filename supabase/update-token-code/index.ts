import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    // 1. Parse Body ONCE at the top.
    // We need this data for both the main logic AND the fail-safe.
    let payload = {};
    try {
        payload = await req.json();
    } catch (e) {
        console.error("Failed to parse JSON body", e);
        return new Response(JSON.stringify({ error: "Invalid JSON" }), { headers: corsHeaders, status: 400 });
    }

    const { record_id, image_url } = payload;

    try {
        if (!record_id || !image_url) throw new Error('Missing record_id or image_url');

        console.log(`Processing: ${image_url}`);

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

        // Treat non-200 or empty bodies as failure
        if (!apiRes.ok) throw new Error(`OTFBM returned status ${apiRes.status}`);

        const htmlText = await apiRes.text();
        let cleanCode = "";

        // Simple parsing
        const parts = htmlText.split('<body>');
        if (parts.length > 1) {
            cleanCode = parts[1].split('</body>')[0].trim();
        } else {
            cleanCode = htmlText.trim();
        }

        // Validation
        if (cleanCode.length > 8 || cleanCode.length === 0) {
            console.warn("Invalid code found. Resetting to empty for manual entry.");
            cleanCode = "";
        }

        // --- Database Update (Success) ---
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        const { error: updateError } = await supabase
            .from('tokens')
            .update({ token_code: cleanCode })
            .eq('id', record_id);

        if (updateError) throw updateError;

        return new Response(
            JSON.stringify({ success: true, code: cleanCode }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error("Function Error:", error.message);

        // --- Fail-Safe ---
        // Update DB to empty string so user gets the Manual Input field
        if (record_id) {
            try {
                const supabase = createClient(
                    Deno.env.get('SUPABASE_URL') ?? '',
                    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
                );
                await supabase.from('tokens').update({ token_code: "" }).eq('id', record_id);
                console.log("Fail-safe: Reset token_code to empty string.");
            } catch (dbError) {
                console.error("Fail-safe DB update failed:", dbError);
            }
        }

        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
    }
});