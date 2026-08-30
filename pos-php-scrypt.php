<?php
/** RFC 7914 scrypt, compatible with Node crypto.scrypt / server/password.js */

function pos_u32($x) {
  return $x & 0xFFFFFFFF;
}

function pos_rotl($x, $n) {
  $x = pos_u32($x);
  return pos_u32(($x << $n) | ($x >> (32 - $n)));
}

function pos_salsa20_8($block) {
  $x = array_values(unpack("V16", $block));
  $z = $x;
  for ($i = 0; $i < 8; $i += 2) {
    $x[4] ^= pos_rotl(pos_u32($x[0] + $x[12]), 7);
    $x[8] ^= pos_rotl(pos_u32($x[4] + $x[0]), 9);
    $x[12] ^= pos_rotl(pos_u32($x[8] + $x[4]), 13);
    $x[0] ^= pos_rotl(pos_u32($x[12] + $x[8]), 18);
    $x[9] ^= pos_rotl(pos_u32($x[5] + $x[1]), 7);
    $x[13] ^= pos_rotl(pos_u32($x[9] + $x[5]), 9);
    $x[1] ^= pos_rotl(pos_u32($x[13] + $x[9]), 13);
    $x[5] ^= pos_rotl(pos_u32($x[1] + $x[13]), 18);
    $x[14] ^= pos_rotl(pos_u32($x[10] + $x[6]), 7);
    $x[2] ^= pos_rotl(pos_u32($x[14] + $x[10]), 9);
    $x[6] ^= pos_rotl(pos_u32($x[2] + $x[14]), 13);
    $x[10] ^= pos_rotl(pos_u32($x[6] + $x[2]), 18);
    $x[3] ^= pos_rotl(pos_u32($x[15] + $x[11]), 7);
    $x[7] ^= pos_rotl(pos_u32($x[3] + $x[15]), 9);
    $x[11] ^= pos_rotl(pos_u32($x[7] + $x[3]), 13);
    $x[15] ^= pos_rotl(pos_u32($x[11] + $x[7]), 18);
    $x[1] ^= pos_rotl(pos_u32($x[0] + $x[3]), 7);
    $x[2] ^= pos_rotl(pos_u32($x[1] + $x[0]), 9);
    $x[3] ^= pos_rotl(pos_u32($x[2] + $x[1]), 13);
    $x[0] ^= pos_rotl(pos_u32($x[3] + $x[2]), 18);
    $x[6] ^= pos_rotl(pos_u32($x[5] + $x[4]), 7);
    $x[7] ^= pos_rotl(pos_u32($x[6] + $x[5]), 9);
    $x[4] ^= pos_rotl(pos_u32($x[7] + $x[6]), 13);
    $x[5] ^= pos_rotl(pos_u32($x[4] + $x[7]), 18);
    $x[11] ^= pos_rotl(pos_u32($x[10] + $x[9]), 7);
    $x[8] ^= pos_rotl(pos_u32($x[11] + $x[10]), 9);
    $x[9] ^= pos_rotl(pos_u32($x[8] + $x[11]), 13);
    $x[10] ^= pos_rotl(pos_u32($x[9] + $x[8]), 18);
    $x[12] ^= pos_rotl(pos_u32($x[15] + $x[14]), 7);
    $x[13] ^= pos_rotl(pos_u32($x[12] + $x[15]), 9);
    $x[14] ^= pos_rotl(pos_u32($x[13] + $x[12]), 13);
    $x[15] ^= pos_rotl(pos_u32($x[14] + $x[13]), 18);
  }
  $out = "";
  for ($i = 0; $i < 16; $i++) {
    $out .= pack("V", pos_u32($x[$i] + $z[$i]));
  }
  return $out;
}

function pos_xorstr($a, $b) {
  return $a ^ $b;
}

function pos_blockmix($B, $r) {
  $X = substr($B, (2 * $r - 1) * 64, 64);
  $even = "";
  $odd = "";
  for ($i = 0; $i < 2 * $r; $i++) {
    $X = pos_salsa20_8(pos_xorstr($X, substr($B, $i * 64, 64)));
    if ($i % 2 === 0) $even .= $X;
    else $odd .= $X;
  }
  return $even . $odd;
}

function pos_integerify($B, $r) {
  $u = unpack("V", substr($B, (2 * $r - 1) * 64, 4));
  return $u[1];
}

function pos_romix($B, $N, $r) {
  $X = $B;
  $V = [];
  for ($i = 0; $i < $N; $i++) {
    $V[$i] = $X;
    $X = pos_blockmix($X, $r);
  }
  for ($i = 0; $i < $N; $i++) {
    $j = pos_integerify($X, $r) % $N;
    $X = pos_blockmix(pos_xorstr($X, $V[$j]), $r);
  }
  return $X;
}

function pos_scrypt_raw($password, $salt, $N, $r, $p, $dkLen) {
  $password = (string) $password;
  $B = hash_pbkdf2("sha256", $password, $salt, 1, $p * 128 * $r, true);
  for ($i = 0; $i < $p; $i++) {
    $off = $i * 128 * $r;
    $mixed = pos_romix(substr($B, $off, 128 * $r), $N, $r);
    $B = substr_replace($B, $mixed, $off, 128 * $r);
  }
  return hash_pbkdf2("sha256", $password, $B, 1, $dkLen, true);
}

function pos_b64url_decode($s) {
  $s = strtr((string) $s, "-_", "+/");
  $pad = strlen($s) % 4;
  if ($pad) $s .= str_repeat("=", 4 - $pad);
  $bin = base64_decode($s, true);
  return $bin === false ? "" : $bin;
}

function pos_b64url_encode($bin) {
  return rtrim(strtr(base64_encode($bin), "+/", "-_"), "=");
}

function pos_verify_password($password, $stored) {
  if (!$stored || $password === null || $password === "") return false;
  $parts = explode("$", (string) $stored);
  if (count($parts) < 6 || $parts[0] !== "scrypt") return false;
  $N = (int) $parts[1];
  $r = (int) $parts[2];
  $p = (int) $parts[3];
  $salt = pos_b64url_decode($parts[4]);
  $expected = pos_b64url_decode($parts[5]);
  if ($salt === "" || $expected === "" || $N < 2 || $r < 1 || $p < 1) return false;
  @set_time_limit(180);
  @ini_set("memory_limit", "256M");
  $actual = pos_scrypt_raw((string) $password, $salt, $N, $r, $p, strlen($expected));
  return hash_equals($expected, $actual);
}

function pos_hash_password($password) {
  $N = 32768;
  $r = 8;
  $p = 1;
  $salt = random_bytes(16);
  @set_time_limit(180);
  @ini_set("memory_limit", "256M");
  $key = pos_scrypt_raw((string) $password, $salt, $N, $r, $p, 32);
  return "scrypt$" . $N . "$" . $r . "$" . $p . "$" . pos_b64url_encode($salt) . "$" . pos_b64url_encode($key);
}
