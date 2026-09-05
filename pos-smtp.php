<?php
/**
 * Hostinger mailbox for ATAV POS outgoing mail.
 * POS only sends (SMTP). IMAP is for receiving in Outlook or a phone app.
 * Override any key in pos-db.php or .env if the mailbox changes.
 */
return [
  "SMTP_ENABLED" => "1",
  "SMTP_HOST" => "smtp.hostinger.com",
  "SMTP_PORT" => "465",
  "SMTP_SECURE" => "1",
  "SMTP_USER" => "pos@atavtelecom.in",
  "SMTP_PASS" => "J:0TL0h>",
  "MAIL_FROM" => "pos@atavtelecom.in",
  "MAIL_FROM_NAME" => "ATAV POS",
  "IMAP_HOST" => "imap.hostinger.com",
  "IMAP_PORT" => "993",
];
