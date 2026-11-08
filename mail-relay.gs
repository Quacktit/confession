// Paste into script.google.com (logged in as the site's Gmail account).
// Project Settings -> Script Properties: add SECRET (same value as MAIL_WEBHOOK_SECRET on Render).
// Deploy -> New deployment -> Web app -> Execute as: Me, Who has access: Anyone.
function doPost(e) {
  var data = JSON.parse(e.postData.contents);
  var secret = PropertiesService.getScriptProperties().getProperty('SECRET');
  if (!secret || data.secret !== secret) {
    return ContentService.createTextOutput('forbidden');
  }
  MailApp.sendEmail({ to: data.to, subject: data.subject, body: data.text, name: 'unspokenadc' });
  return ContentService.createTextOutput('ok');
}
