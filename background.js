console.log("Background script loaded for Immersive Translate.");

// Helper function to get settings from chrome.storage.local
async function getStoredSettings() {
  const keys = ['msApiKey', 'msApiRegion', 'googleApiKey', 'translationService'];
  try {
    const items = await new Promise((resolve, reject) => {
      chrome.storage.local.get(keys, (result) => {
        if (chrome.runtime.lastError) {
          return reject(chrome.runtime.lastError);
        }
        resolve(result);
      });
    });
    return items;
  } catch (error) {
    console.error("Error getting stored settings:", error);
    // Return an empty object or defaults if critical, or rethrow/reject
    return Promise.reject(error); 
  }
}

function escapeXml(unsafeText) {
  return unsafeText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

async function translateTextsWithMicrosoftAPI(texts, targetLanguage) {
  let settings;
  try {
    settings = await getStoredSettings();
  } catch (error) {
    return Promise.reject("Failed to retrieve settings for Microsoft API: " + error.message);
  }

  const msApiKey = settings.msApiKey;
  const msApiRegion = settings.msApiRegion;

  if (!msApiKey || msApiKey.trim() === "" || msApiKey === "YOUR_API_KEY_HERE") {
    console.error("Microsoft Translator API key not configured in options.");
    return Promise.reject("Microsoft API key not configured in options.");
  }
  // Region can sometimes be optional or not applicable for global endpoints, but good to check if your key type requires it.
  // For this exercise, we'll assume it might be needed but won't strictly enforce it beyond the key.
  if (!msApiRegion || msApiRegion.trim() === "" || msApiRegion === "YOUR_REGION_HERE") {
     console.warn("Microsoft Translator API region might not be configured in options. Proceeding without it if possible.");
     // Some keys/endpoints might not strictly require a region header, especially if it's a global resource.
     // If your key specifically needs it, then this should be an error:
     // return Promise.reject("Microsoft API region not configured in options.");
  }


  const apiUrl = `https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=${targetLanguage}`;
  const requestBody = texts.map(text => ({ "Text": text }));

  const headers = {
    'Ocp-Apim-Subscription-Key': msApiKey,
    'Content-Type': 'application/json; charset=UTF-8'
  };

  // Only add region header if it's configured and not the placeholder
  if (msApiRegion && msApiRegion.trim() !== "" && msApiRegion !== "YOUR_REGION_HERE") {
    headers['Ocp-Apim-Subscription-Region'] = msApiRegion;
  }

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestBody)
    });

    if (response.ok) {
      const responseBody = await response.json();
      return responseBody.map(item => item.translations[0].text);
    } else {
      const errorText = await response.text();
      console.error("Microsoft Translator API Error:", response.status, errorText);
      return Promise.reject(`Microsoft API request failed with status ${response.status}: ${errorText}`);
    }
  } catch (error) {
    console.error("Network error or problem fetching from Microsoft Translator API:", error);
    return Promise.reject(`Network error (Microsoft): ${error.message}`);
  }
}

async function translateTextsWithGoogleAPI(texts, targetLanguage, sourceLanguage) {
  let settings;
  try {
    settings = await getStoredSettings();
  } catch (error) {
    return Promise.reject("Failed to retrieve settings for Google API: " + error.message);
  }
  
  const googleApiKey = settings.googleApiKey;

  if (!googleApiKey || googleApiKey.trim() === "" || googleApiKey === "YOUR_GOOGLE_API_KEY_HERE") {
    console.error("Google Translate API key not configured in options.");
    return Promise.reject("Google API key not configured in options.");
  }

  const apiUrl = `https://translation.googleapis.com/language/translate/v2?key=${googleApiKey}`;
  
  const requestPayload = {
    q: texts,
    target: targetLanguage,
    format: "text"
  };

  if (sourceLanguage) {
    requestPayload.source = sourceLanguage;
  }

  const headers = {
    'Content-Type': 'application/json'
  };

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestPayload)
    });

    const responseBody = await response.json();

    if (response.ok) {
      if (responseBody.data && responseBody.data.translations) {
        return responseBody.data.translations.map(item => item.translatedText);
      } else {
        console.error("Google Translate API Error: Unexpected response format", responseBody);
        return Promise.reject("Google API request failed: Unexpected response format");
      }
    } else {
      let errorMessage = "Google API request failed";
      if (responseBody.error && responseBody.error.message) {
        errorMessage = responseBody.error.message;
      }
      console.error("Google Translate API Error:", response.status, responseBody);
      return Promise.reject(`${errorMessage} (Status: ${response.status})`);
    }
  } catch (error) {
    console.error("Network error or problem fetching from Google Translate API:", error);
    return Promise.reject(`Network error (Google): ${error.message}`);
  }
}

async function synthesizeSpeechWithAzureTTS(text, languageCode, voiceName) {
  let settings;
  try {
    settings = await getStoredSettings();
  } catch (error) {
    return Promise.reject("Failed to retrieve settings for Azure TTS: " + error.message);
  }

  const azureSpeechKey = settings.msApiKey; // Using msApiKey for Azure Speech
  const azureSpeechRegion = settings.msApiRegion; // Using msApiRegion for Azure Speech

  if (!azureSpeechKey || azureSpeechKey.trim() === "" || azureSpeechKey === "YOUR_API_KEY_HERE") {
    console.error("Azure Speech API key not configured in options (uses Microsoft Translator key).");
    return Promise.reject("Azure Speech API key not configured in options.");
  }
  if (!azureSpeechRegion || azureSpeechRegion.trim() === "" || azureSpeechRegion === "YOUR_REGION_HERE") {
    console.error("Azure Speech API region not configured in options (uses Microsoft Translator region).");
    return Promise.reject("Azure Speech API region not configured in options.");
  }

  const ttsApiUrl = `https://${azureSpeechRegion}.tts.speech.microsoft.com/cognitiveservices/v1`;
  
  const ssmlBody = `
    <speak version='1.0' xml:lang='${languageCode}'>
        <voice xml:lang='${languageCode}' name='${voiceName}'>
            ${escapeXml(text)}
        </voice>
    </speak>
  `;

  const headers = {
    'Ocp-Apim-Subscription-Key': azureSpeechKey,
    'Content-Type': 'application/ssml+xml',
    'X-Microsoft-OutputFormat': 'audio-24khz-160kbitrate-mono-mp3',
    'User-Agent': 'ImmersiveTranslateExtension/0.1'
  };

  try {
    const response = await fetch(ttsApiUrl, {
      method: 'POST',
      headers: headers,
      body: ssmlBody
    });

    if (response.ok) {
      const audioArrayBuffer = await response.arrayBuffer();
      const base64String = arrayBufferToBase64(audioArrayBuffer);
      return `data:audio/mpeg;base64,${base64String}`;
    } else {
      const errorText = await response.text();
      console.error("Azure TTS API Error:", response.status, errorText);
      return Promise.reject(`Azure TTS API request failed with status ${response.status}: ${errorText}`);
    }
  } catch (error) {
    console.error("Network error or problem fetching from Azure TTS API:", error);
    return Promise.reject(`Network error (Azure TTS): ${error.message}`);
  }
}


chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  // Route for generic page translation (from popup.js)
  if (request.action === "translatePageContent") { // Renamed for clarity
    console.log("Received translatePageContent message with texts:", request.texts, "and target language:", request.targetLanguage);
    if (!request.texts || !request.targetLanguage) {
      console.error("Invalid translatePageContent request: texts or targetLanguage missing.");
      sendResponse({ error: "Invalid translatePageContent request: texts or targetLanguage missing." });
      return false; 
    }

    getStoredSettings().then(settings => {
      const preferredService = settings.translationService || 'microsoft'; // Default to Microsoft

      if (preferredService === 'google') {
        console.log("Using Google Translate for page content.");
        translateTextsWithGoogleAPI(request.texts, request.targetLanguage, request.sourceLanguage)
          .then(translatedTexts => sendResponse({ translatedTexts: translatedTexts }))
          .catch(error => sendResponse({ error: error.toString() }));
      } else { // Default to Microsoft
        console.log("Using Microsoft Translator for page content.");
        translateTextsWithMicrosoftAPI(request.texts, request.targetLanguage)
          .then(translatedTexts => sendResponse({ translatedTexts: translatedTexts }))
          .catch(error => sendResponse({ error: error.toString() }));
      }
    }).catch(error => {
      console.error("Failed to get stored settings for page translation:", error);
      sendResponse({ error: "Failed to get stored settings: " + error.message });
    });
    
    return true; // Indicates that the response will be sent asynchronously
  
  // Route for YouTube caption translation (from content.js) - Stays with Microsoft
  } else if (request.action === "translateMicrosoft") { 
    console.log("Received translateMicrosoft message (likely for YouTube captions) with texts:", request.texts, "and target language:", request.targetLanguage);
    if (!request.texts || !request.targetLanguage) {
      console.error("Invalid translateMicrosoft request: texts or targetLanguage missing.");
      sendResponse({ error: "Invalid translateMicrosoft request: texts or targetLanguage missing." });
      return false; 
    }
    translateTextsWithMicrosoftAPI(request.texts, request.targetLanguage)
      .then(translatedTexts => sendResponse({ translatedTexts: translatedTexts }))
      .catch(error => sendResponse({ error: error.toString() }));
    return true;

  // This route might become redundant if the generic "translatePageContent" is always used by content scripts
  // that want to respect user preference. For now, keeping it means a direct call to Google is still possible.
  } else if (request.action === "translateGoogle") {
    console.log("Received direct translateGoogle message with texts:", request.texts, 
                "target language:", request.targetLanguage, 
                "source language:", request.sourceLanguage);
    if (!request.texts || !request.targetLanguage) {
      console.error("Invalid Google translate request: texts or targetLanguage missing.");
      sendResponse({ error: "Invalid Google translate request: texts or targetLanguage missing." });
      return false;
    }
    translateTextsWithGoogleAPI(request.texts, request.targetLanguage, request.sourceLanguage)
      .then(translatedTexts => sendResponse({ translatedTexts: translatedTexts }))
      .catch(error => sendResponse({ error: error.toString() }));
    return true;
  
  } else if (request.action === "synthesizeSpeechAzure") {
    console.log("Received synthesizeSpeechAzure message with text:", request.text,
                "languageCode:", request.languageCode,
                "voiceName:", request.voiceName);
    if (!request.text || !request.languageCode || !request.voiceName) {
      console.error("Invalid Azure TTS request: text, languageCode, or voiceName missing.");
      sendResponse({ error: "Invalid Azure TTS request: text, languageCode, or voiceName missing." });
      return false;
    }
    synthesizeSpeechWithAzureTTS(request.text, request.languageCode, request.voiceName)
      .then(audioDataUri => sendResponse({ audioDataUri: audioDataUri }))
      .catch(error => sendResponse({ error: error.toString() }));
    return true;
  }
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command === "trigger-on-page-translation") {
    console.log("Keyboard shortcut 'trigger-on-page-translation' received.");
    // We need to ensure 'tab' is the active tab where the command was issued.
    // The 'tab' parameter here is the tab that was active when the command was executed.
    if (tab && tab.id) {
      try {
        // Ensure the tab is active and in the current window before sending.
        // This is a good practice, though 'tab' from onCommand should be the active one.
        const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTabs && activeTabs.length > 0 && activeTabs[0].id === tab.id) {
          await chrome.tabs.sendMessage(tab.id, { action: "shortcutTranslate" });
          console.log("Sent 'shortcutTranslate' message to tab:", tab.id);
        } else {
          console.warn("Command received, but the tab provided by the event is not the currently active tab. Message not sent.", tab, activeTabs);
        }
      } catch (error) {
        console.error("Error sending 'shortcutTranslate' message to tab:", tab.id, error.message);
        // This can happen if the content script isn't loaded on the page (e.g., chrome:// pages)
        // or if the tab was closed before the message could be sent.
      }
    } else {
        console.warn("Command received but no valid tab information provided.");
    }
  }
});
