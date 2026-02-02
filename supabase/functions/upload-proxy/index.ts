import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MAX_DIMENSION = 2000;

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    try {
        const freeImageKey = Deno.env.get('FREEIMAGE_KEY');
        const resizelyKey = Deno.env.get('RESIZELY_API_KEY');

        if (!freeImageKey) throw new Error("Missing FREEIMAGE_KEY secret.");
        if (!resizelyKey) throw new Error("Missing RESIZELY_API_KEY secret.");

        const url = new URL(req.url)
        const type = url.searchParams.get('type')
        const imageId = url.searchParams.get('id')

        let originalUrl, originalFilename, originalWidth, originalHeight, thumbUrl, providerId, viewerUrl;

        if (type === 'batch_resize' && imageId) {
            const { data: img, error: imgError } = await supabase.from('freehost_images').select('*').eq('id', imageId).single()
            if (imgError || !img) throw new Error(`Image not found in DB (ID: ${imageId})`);

            originalUrl = img.image_url;
            originalFilename = img.original_filename || `img_${imageId}`;
            originalWidth = img.width;
            originalHeight = img.height;
            thumbUrl = img.thumb_url;
            viewerUrl = img.viewer_url;
        } else {
            const formData = await req.formData()
            const imageFile = formData.get('file')
            if (!imageFile || !(imageFile instanceof File)) throw new Error('No file provided')

            const res_upload = await fetch('https://freeimage.host/api/1/upload', {
                method: 'POST',
                body: (() => {
                    const form = new FormData()
                    form.append('key', freeImageKey)
                    form.append('action', 'upload')
                    form.append('source', imageFile)
                    form.append('format', 'json')
                    return form
                })()
            })
            const json = await res_upload.json()
            if (json.status_code !== 200) throw new Error('FreeImage upload failed: ' + (json.error?.message || 'Unknown error'))

            originalUrl = json.image.url
            originalWidth = parseInt(json.image.width)
            originalHeight = parseInt(json.image.height)
            thumbUrl = json.image.thumb.url;
            providerId = json.image.name;
            viewerUrl = json.image.url_viewer;
            originalFilename = json.image.filename || providerId;
        }

        // Proxy every image through Resizely to ensure it's JPG and sized correctly (<1MB)
        const constraint = `w=${MAX_DIMENSION}:h=${MAX_DIMENSION}:fit=max:out=jpg:quality=80`;
        const rRes = await fetch(`https://api.resizely.net/${resizelyKey}/${constraint}/${originalUrl}`)

        if (!rRes.ok) {
            const errorText = await rRes.text();
            throw new Error(`Resizely transformation failed: ${rRes.status} ${errorText}`);
        }

        const rBlob = await rRes.blob()
        const rForm = new FormData()
        rForm.append('key', freeImageKey)
        rForm.append('action', 'upload')

        const safeBaseName = originalFilename.replace(/\.[^/.]+$/, "");
        rForm.append('source', rBlob, `resized_${safeBaseName}.jpg`)
        rForm.append('format', 'json')

        const ruRes = await fetch('https://freeimage.host/api/1/upload', { method: 'POST', body: rForm })
        const ruJson = await ruRes.json()

        if (ruJson.status_code !== 200) {
            throw new Error(`Optimized upload to FreeImage failed: ${ruJson.error?.message || 'Unknown error'}`);
        }

        const resizedUrl = ruJson.image.url
        const rW = parseInt(ruJson.image.width)
        const rH = parseInt(ruJson.image.height)
        const wasResized = true

        if (!resizedUrl) {
            throw new Error("Optimization succeeded but no URL was returned by the provider.");
        }

        let finalId = imageId;
        if (type === 'batch_resize') {
            const { error: updErr } = await supabase.from('freehost_images').update({
                resized_url: resizedUrl,
                resized_width: rW,
                resized_height: rH,
                was_resized: wasResized
            }).eq('id', imageId)
            if (updErr) throw new Error(`Database update failed: ${updErr.message}`);
        } else {
            const { data, error: insertError } = await supabase.from('freehost_images').insert({
                image_url: originalUrl,
                thumb_url: thumbUrl,
                provider_id: providerId,
                viewer_url: viewerUrl,
                width: originalWidth,
                height: originalHeight,
                original_filename: originalFilename,
                resized_url: resizedUrl,
                resized_width: rW,
                resized_height: rH,
                was_resized: wasResized,
                delete_url: null
            }).select('id').single()

            if (insertError) throw new Error(`Database insert failed: ${insertError.message}`);
            finalId = data.id
        }

        return new Response(JSON.stringify({
            success: true,
            id: finalId,
            thumb: thumbUrl,
            url: originalUrl,
            resizedUrl: resizedUrl,
            optimized_url: resizedUrl
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    } catch (error) {
        console.error("Function Error:", error.message);
        try {
            await supabase.from('errors').insert({
                module: 'upload-proxy',
                error: error.message
            });
        } catch (logLimitErr) {
            console.error("Secondary error logging failure:", logLimitErr.message);
        }

        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500
        })
    }
})
