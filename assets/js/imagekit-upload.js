// ImageKit Upload Helper with Automatic Image Optimization
// Resizes images to max 4096px and optimizes quality at upload time

export async function uploadImage() {
  const fileInput = document.getElementById("ik-file");
  const file = fileInput.files[0];
  
  if (!file) {
    console.error("No file selected");
    return null;
  }

  try {
    // 1. Get ImageKit authentication token from your backend
    const authResponse = await fetch("/api/imagekit-auth"); // Adjust this URL to your auth endpoint
    const authData = await authResponse.json();

    // 2. Initialize ImageKit
    const imagekit = new ImageKit({
      publicKey: authData.publicKey,
      urlEndpoint: authData.urlEndpoint,
      authenticationEndpoint: authData.authenticationEndpoint
    });

    // 3. Read file as base64
    const fileData = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    // 4. Upload with transformation parameters
    const result = await imagekit.upload({
      file: fileData,
      fileName: file.name,
      folder: "/battlemaps", // Optional: organize uploads in a folder
      transformation: {
        // Apply transformations at upload time to save storage/bandwidth
        pre: 'w-4096,h-4096,c-at_max,q-85,f-auto'
        // w-4096: Max width 4096px
        // h-4096: Max height 4096px  
        // c-at_max: Fit within dimensions, maintain aspect ratio
        // q-85: 85% quality (good balance of quality vs file size)
        // f-auto: Auto-select best format (WebP for modern browsers, fallback to original)
      },
      useUniqueFileName: true // Prevent filename conflicts
    });

    console.log("Upload successful:", result);
    return result; // Returns { url, fileId, name, etc. }

  } catch (error) {
    console.error("Upload failed:", error);
    alert("Upload failed: " + error.message);
    return null;
  }
}