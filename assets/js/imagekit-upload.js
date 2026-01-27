// ImageKit Upload Helper with Automatic Image Optimization
// Uses Supabase Edge Function for secure authentication

import { supabase } from "./supabaseClient.js";

export async function uploadImage() {
  const fileInput = document.getElementById("ik-file");
  const file = fileInput.files[0];
  
  if (!file) {
    console.error("No file selected");
    return null;
  }

  try {
    // Get the current session
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      throw new Error('You must be logged in to upload images');
    }
    
    // Call Supabase Edge Function for authentication
    const { data: authData, error: authError } = await supabase.functions.invoke('imagekit-auth', {
      method: 'POST'
    });
    
    if (authError) {
      throw new Error(`Auth failed: ${authError.message}`);
    }
    
    console.log("Auth successful:", authData);

    // Initialize ImageKit
    const imagekit = new ImageKit({
      publicKey: "public_bPs07/2jWzBhLfDfD3Rl0KLaRgo=", // Replace with your ImageKit public key
      urlEndpoint: "https://ik.imagekit.io/coconutsw" // Replace with your ImageKit URL endpoint
    });

    // Read file as base64
    const fileData = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
 
    console.log("Upload successful:", result);
    return result; // Returns { url, fileId, name, etc. }

  } catch (error) {
    console.error("Upload failed:", error);
    alert("Upload failed: " + error.message);
    return null;
  }
}