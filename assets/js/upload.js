(function() {
  // --- CONFIGURATION ---
  const SUPABASE_PROJECT_URL = 'https://kcbvryvmcbfpsibxthhn.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtjYnZyeXZtY2JmcHNpYnh0aGhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1OTk1MzIsImV4cCI6MjA3OTE3NTUzMn0.9h81WHRCJfhouquG9tPHliY_5ezAbzKeDoLtGSARo5M';
  const FUNCTION_URL = `https://kcbvryvmcbfpsibxthhn.supabase.co/functions/v1/upload-proxy`;

 // --- STYLES & MODAL SETUP ---
  const styles = `
    .upload-overlay { position: fixed; top:0; left:0; width:100%; height:100%; background: rgba(0,0,0,0.5); display: none; justify-content: center; align-items: center; z-index: 1000; }
    .upload-modal { background: white; padding: 2rem; border-radius: 8px; width: 350px; text-align: center; font-family: sans-serif; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .spinner { border: 4px solid #f3f3f3; border-top: 4px solid #28a745; border-radius: 50%; width: 20px; height: 20px; animation: spin 1s linear infinite; display: inline-block; vertical-align: middle; margin-left: 10px; }
    .disclaimer { font-size: 0.75rem; color: #666; margin-top: 1.5rem; text-align: left; line-height: 1.4; border-top: 1px solid #eee; padding-top: 1rem; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
  `;
  const styleSheet = document.createElement("style");
  styleSheet.innerText = styles;
  document.head.appendChild(styleSheet);

  // Create the invisible Modal and append to body
  const overlay = document.createElement('div');
  overlay.id = 'u-overlay';
  overlay.className = 'upload-overlay';
  overlay.innerHTML = `
    <div class="upload-modal">
      <h3>Select Image</h3>
      <input type="file" id="u-file" accept="image/*" style="margin-bottom: 1rem;">
      <br>
      <button id="u-submit" style="background:#28a745; color:white; border:none; padding:10px 20px; border-radius:4px; cursor:pointer;">Submit</button>
      <button id="u-cancel" style="margin-left:10px; cursor:pointer; background:none; border:none; text-decoration:underline;">Cancel</button>
      
      <div id="u-status" style="margin-top:10px; font-size:0.9em;"></div>

      <div class="disclaimer">
        <strong>Warning:</strong> The file will be uploaded to a free image hosting service (<a href="https://freeimage.host" target="_blank">freeimage.host</a>) and available for public download. It cannot be removed easily. If you are not comfortable with this, please contact the site administrator.
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // --- HELPER: RESET & CLOSE ---
  function closeAndReset() {
      document.getElementById('u-overlay').style.display = 'none';
      document.getElementById('u-file').value = ''; // Clear the file input
      document.getElementById('u-status').innerText = ''; // Clear status text
  }

  // --- EVENT LISTENERS ---
  
  // Open Modal (and clear previous cache)
  document.addEventListener('click', function(e) {
    if (e.target && e.target.classList.contains('trigger-upload')) {
      document.getElementById('u-file').value = ''; // Ensure fresh start
      document.getElementById('u-status').innerText = ''; 
      document.getElementById('u-overlay').style.display = 'flex';
    }
  });

  // Close/Cancel Button
  document.getElementById('u-cancel').addEventListener('click', closeAndReset);

  // Submit Button
  document.getElementById('u-submit').addEventListener('click', async () => {
    const fileInput = document.getElementById('u-file');
    const statusDiv = document.getElementById('u-status');
    
    if(fileInput.files.length === 0) {
      statusDiv.innerText = "Please select a file.";
      return;
    }

    statusDiv.innerHTML = 'Uploading... <div class="spinner"></div>';
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);

    try {
      const response = await fetch(FUNCTION_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: formData
      });
      const result = await response.json();

      if (result.success) {
        statusDiv.innerText = "Success!";
        setTimeout(() => {
          // Dispatch event with ID
          window.dispatchEvent(new CustomEvent('image-upload-complete', { 
            detail: { id: result.id, thumb: result.thumb } 
          }));
          closeAndReset(); // Close and clear the input
        }, 1000);
      } else {
        statusDiv.innerText = "Error: " + (result.error || "Unknown");
      }
    } catch (e) {
      statusDiv.innerText = "Network Error";
      console.error(e);
    }
  });
})();