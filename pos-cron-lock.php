<?php
/** One background cron start every few minutes. The tick itself still takes the DB lock. */

function pos_cron_claim($root, $seconds = 300) {
  $dir = rtrim((string) $root, "/") . "/pos-data";
  if (!is_dir($dir)) @mkdir($dir, 0775, true);
  $file = $dir . "/automation-tick.lock";
  $fh = @fopen($file, "c+");
  if (!$fh) return false;
  if (!flock($fh, LOCK_EX | LOCK_NB)) {
    fclose($fh);
    return false;
  }
  $last = (int) trim((string) stream_get_contents($fh));
  $due = $last <= 0 || (time() - $last) >= max(30, (int) $seconds);
  if ($due) {
    ftruncate($fh, 0);
    rewind($fh);
    fwrite($fh, (string) time());
    fflush($fh);
  }
  flock($fh, LOCK_UN);
  fclose($fh);
  return $due;
}
