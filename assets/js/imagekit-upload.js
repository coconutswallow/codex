import { supabase } from "./supabaseClient.js";

const imagekit = new ImageKit({
  publicKey: "public_bPs07/2jWzBhLfDfD3Rl0KLaRgo=",
  urlEndpoint: "https://ik.imagekit.io/YOUR_ID",
  authenticationEndpoint: "/api/imagekit-auth" // later
});

export async function uploadImage() {
  const fileInput = document.getElementById("ik-file");
  const urlInput = document.getElementById("ik-url");

  const file = fileInput?.files[0];
  const url = urlInput?.value;

  if (!file && !url) {
    alert("Select a file or paste a URL.");
    return null;
  }

  if (file && file.size > 5 * 1024 * 1024) {
    alert("Max file size is 5MB.");
    return null;
  }

  return new Promise((resolve, reject) => {
    imagekit.upload(
      {
        file: file || url,
        fileName: file?.name || "map-image",
        folder: "/battlemaps",
        useUniqueFileName: true
      },
      (err, result) => {
        if (err) {
          console.error(err);
          reject(err);
        } else {
          resolve({
            url: result.url,
            thumbnail: result.url + "?tr=w-400",
            width: result.width,
            height: result.height
          });
        }
      }
    );
  });
}
