console.log("Popup script loaded.");

document.addEventListener('DOMContentLoaded', function() {
  const translateButton = document.getElementById('translateButton');
  if (translateButton) {
    translateButton.addEventListener('click', function() {
      chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        if (tabs[0] && tabs[0].id) {
          chrome.tabs.sendMessage(tabs[0].id, { action: "translate" }, function(response) {
            if (chrome.runtime.lastError) {
              console.error("Error sending message:", chrome.runtime.lastError.message);
            } else {
              console.log("Message sent to content script, response:", response);
            }
          });
        } else {
          console.error("Could not find active tab.");
        }
      });
    });
  } else {
    console.error("Translate button not found.");
  }
});
