(function() {
  // --- CONFIGURATION ---
  const SUPABASE_PROJECT_URL = 'https://kcbvryvmcbfpsibxthhn.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtjYnZyeXZtY2JmcHNpYnh0aGhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1OTk1MzIsImV4cCI6MjA3OTE3NTUzMn0.9h81WHRCJfhouquG9tPHliY_5ezAbzKeDoLtGSARo5M';
  const FUNCTION_URL = `https://kcbvryvmcbfpsibxthhn.supabase.co/functions/v1/upload-proxy`;

 // --- STYLES & MODAL SETUP ---
  const styles = `
    .upload-overlay { 
      position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
      background: rgba(255, 255, 255, 0.2); /* Light overlay for contrast against dark modal */
      backdrop-filter: blur(2px);
      display: none; justify-content: center; align-items: center; z-index: 1000; 
    }
    .upload-modal { 
      background: #000000; 
      color: #ffffff; 
      padding: 2rem; 
      border-radius: 8px; 
      width: 400px; 
      text-align: left; /* Left Justified */
      font-family: sans-serif; 
      box-shadow: 0 10px 25px rgba(0,0,0,0.5); 
      border: 1px solid #333;
    }
    .upload-modal h3 {
      margin-top: 0;
      margin-bottom: 1rem;
      font-weight: 600;
    }
    .file-input-wrapper {
      border: 1px solid #ffffff; /* Border around input */
      padding: 10px;
      margin-bottom: 1.5rem;
      border-radius: 4px;
      background: #1a1a1a;
    }
    input[type="file"] {
      color: #fff;
      width: 100%;
    }
    .btn-group {
      display: flex;
      gap: 15px; /* Space between buttons */
      justify-content: flex-start; /* Left Justified Buttons */
    }
    .upload-btn { 
      background: #ffffff; color: #000; border: none; padding: 10px 20px; 
      cursor: pointer; border-radius: 4px; font-weight: bold; 
    }
    .upload-btn:hover { background: #e0e0e0; }
    .cancel-btn { 
      background: transparent; color: #aaa; border: 1px solid #aaa; 
      padding: 10px 20px; cursor: pointer; border-radius: 4px; 
    }
    .cancel-btn:hover { color: #fff; border-color: #fff; }
    
    .spinner { border: 3px solid #333; border-top: 3px solid #fff; border-radius: 50%; width: 16px; height: 16px; animation: spin 1s linear infinite; display: inline-block; vertical-align: middle; margin-left: 10px; }
    
    .disclaimer { 
      font-size: 0.75rem; color: #999; margin-top: 1.5rem; 
      text-align: left; line-height: 1.4; border-top: 1px solid #333; padding-top: 1rem; 
    }
    .disclaimer a { color: #fff; text-decoration: underline; }
    
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
      <h3>Select Image to Upload</h3>
      
      <div class="file-input-wrapper">
        <input type="file" id="u-file" accept="image/*">
      </div>

      <div class="btn-group">
        <button id="u-submit" class="upload-btn">Submit</button>
        <button id="u-cancel" class="cancel-btn">Cancel</button>
      </div>
      
      <div id="u-status" style="margin-top:15px; font-size:0.9em; height: 20px;"></div>

      <div class="disclaimer">
        <strong>Warning:</strong> The file will be uploaded to a free image hosting service (<a href="https://freeimage.host" target="_blank">freeimage.host</a>) and available for public download. It cannot be removed easily. If you are not comfortable with this, please contact the site administrator for alternative upload options.
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // --- HELPER: RESET & CLOSE ---
  function closeAndReset() {
      document.getElementById('u-overlay').style.display = 'none';
      document.getElementById('u-file').value = ''; 
      document.getElementById('u-status').innerText = ''; 
  }

  // --- EVENT LISTENERS ---
  document.addEventListener('click', function(e) {
    if (e.target && e.target.classList.contains('trigger-upload')) {
      document.getElementById('u-file').value = ''; 
      document.getElementById('u-status').innerText = ''; 
      document.getElementById('u-overlay').style.display = 'flex';
    }
  });

  document.getElementById('u-cancel').addEventListener('click', closeAndReset);

  document.getElementById('u-submit').addEventListener('click', async () => {
    const fileInput = document.getElementById('u-file');
    const statusDiv = document.getElementById('u-status');
    
    if(fileInput.files.length === 0) {
      statusDiv.style.color = '#ff6b6b'; // Red error text
      statusDiv.innerText = "Please select a file first.";
      return;
    }

    statusDiv.style.color = '#fff';
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
        statusDiv.style.color = '#4cd964'; // Green success text
        statusDiv.innerText = "Success!";
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('image-upload-complete', { 
            detail: { id: result.id, thumb: result.thumb } 
          }));
          closeAndReset(); 
        }, 1000);
      } else {
        statusDiv.style.color = '#ff6b6b';
        statusDiv.innerText = "Error: " + (result.error || "Unknown");
      }
    } catch (e) {
      statusDiv.style.color = '#ff6b6b';
      statusDiv.innerText = "Network Error";
      console.error(e);
    }
  });
})();