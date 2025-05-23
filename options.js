document.addEventListener('DOMContentLoaded', loadOptions);

const msApiKeyInput = document.getElementById('msApiKey');
const msApiRegionInput = document.getElementById('msApiRegion');
const googleApiKeyInput = document.getElementById('googleApiKey');
const saveButton = document.getElementById('saveButton');
const statusArea = document.getElementById('statusArea');

function saveOptions() {
  const msApiKey = msApiKeyInput.value;
  const msApiRegion = msApiRegionInput.value;
  const googleApiKey = googleApiKeyInput.value;
  
  let selectedService = 'microsoft'; // Default
  const checkedRadio = document.querySelector('input[name="translationService"]:checked');
  if (checkedRadio) {
    selectedService = checkedRadio.value;
  }

  const settings = {
    msApiKey: msApiKey,
    msApiRegion: msApiRegion,
    googleApiKey: googleApiKey,
    translationService: selectedService
  };

  chrome.storage.local.set(settings, function() {
    if (chrome.runtime.lastError) {
      console.error("Error saving settings:", chrome.runtime.lastError);
      statusArea.textContent = 'Error saving settings: ' + chrome.runtime.lastError.message;
      statusArea.className = 'status-error';
    } else {
      console.log("Settings saved successfully.");
      statusArea.textContent = 'Settings saved!';
      statusArea.className = 'status-success';
    }
    setTimeout(() => {
      statusArea.textContent = '';
      statusArea.className = '';
    }, 3000);
  });
}

function loadOptions() {
  const keys = ['msApiKey', 'msApiRegion', 'googleApiKey', 'translationService'];
  
  chrome.storage.local.get(keys, function(items) {
    if (chrome.runtime.lastError) {
      console.error("Error loading settings:", chrome.runtime.lastError);
      statusArea.textContent = 'Error loading settings: ' + chrome.runtime.lastError.message;
      statusArea.className = 'status-error';
      setTimeout(() => {
        statusArea.textContent = '';
        statusArea.className = '';
      }, 3000);
      // Set defaults even if loading failed for some reason, to ensure UI consistency
      document.getElementById('serviceMicrosoft').checked = true; 
      return;
    }

    msApiKeyInput.value = items.msApiKey || '';
    msApiRegionInput.value = items.msApiRegion || '';
    googleApiKeyInput.value = items.googleApiKey || '';

    if (items.translationService) {
      const serviceId = 'service' + items.translationService.charAt(0).toUpperCase() + items.translationService.slice(1);
      const radioElement = document.getElementById(serviceId);
      if (radioElement) {
        radioElement.checked = true;
      } else {
        // Fallback if stored service ID is somehow invalid
        console.warn("Stored translationService ID was invalid:", serviceId, "Defaulting to Microsoft.");
        document.getElementById('serviceMicrosoft').checked = true;
      }
    } else {
      // Default to Microsoft if no service is stored
      document.getElementById('serviceMicrosoft').checked = true;
    }
    console.log("Settings loaded.");
  });
}

if (saveButton) {
  saveButton.addEventListener('click', saveOptions);
} else {
  console.error("Save button not found in options.html");
}
