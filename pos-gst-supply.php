<?php

function pos_gst_round2($v) {
  return round((float) ($v ?? 0), 2);
}

function pos_gstin_state_code($gstin) {
  $g = strtoupper(trim((string) ($gstin ?? "")));
  if (strlen($g) >= 2 && preg_match("/^\d{2}/", $g)) return substr($g, 0, 2);
  return "";
}

function pos_gst_normalize_state($state) {
  return strtolower(trim((string) ($state ?? "")));
}

function pos_is_inter_state_supply($shop, $party) {
  $shopCode = pos_gstin_state_code($shop["gstin"] ?? "");
  $partyCode = pos_gstin_state_code($party["gstin"] ?? "");
  if ($shopCode !== "" && $partyCode !== "") return $shopCode !== $partyCode;

  $shopState = pos_gst_normalize_state($shop["state"] ?? "");
  $partyState = pos_gst_normalize_state($party["state"] ?? "");
  if ($shopState !== "" && $partyState !== "") return $shopState !== $partyState;

  return false;
}

function pos_split_gst_amount($totalGst, $interState) {
  $total = pos_gst_round2($totalGst);
  if ($interState) return ["cgst" => 0, "sgst" => 0, "igst" => $total];
  $cgst = pos_gst_round2($total / 2);
  return ["cgst" => $cgst, "sgst" => pos_gst_round2($total - $cgst), "igst" => 0];
}

function pos_line_gst_amount($amount, $gstRate) {
  return pos_gst_round2(((float) ($amount ?? 0)) * ((float) ($gstRate ?? 0)) / 100);
}

function pos_aggregate_gst_by_rate($rows, $shop, $partyGstinKey = "party_gstin", $partyStateKey = "party_state", $orderKey = "order_id") {
  $map = [];
  $billSets = [];
  foreach ($rows as $row) {
    $party = ["gstin" => $row[$partyGstinKey] ?? null, "state" => $row[$partyStateKey] ?? null];
    $inter = pos_is_inter_state_supply($shop, $party);
    $rate = (float) ($row["gst_rate"] ?? 0);
    $taxable = pos_gst_round2($row["amount"] ?? 0);
    $gst = isset($row["gst"]) ? pos_gst_round2($row["gst"]) : pos_line_gst_amount($row["amount"] ?? 0, $rate);
    $split = pos_split_gst_amount($gst, $inter);
    if (!isset($map[$rate])) {
      $map[$rate] = ["gst_rate" => $rate, "taxable" => 0, "gst" => 0, "cgst" => 0, "sgst" => 0, "igst" => 0];
      $billSets[$rate] = [];
    }
    $map[$rate]["taxable"] = pos_gst_round2($map[$rate]["taxable"] + $taxable);
    $map[$rate]["gst"] = pos_gst_round2($map[$rate]["gst"] + $gst);
    $map[$rate]["cgst"] = pos_gst_round2($map[$rate]["cgst"] + $split["cgst"]);
    $map[$rate]["sgst"] = pos_gst_round2($map[$rate]["sgst"] + $split["sgst"]);
    $map[$rate]["igst"] = pos_gst_round2($map[$rate]["igst"] + $split["igst"]);
    $oid = $row[$orderKey] ?? null;
    if ($oid) $billSets[$rate][$oid] = true;
  }
  ksort($map, SORT_NUMERIC);
  $out = [];
  foreach ($map as $rate => $row) {
    $row["bills"] = count($billSets[$rate] ?? []);
    $out[] = $row;
  }
  return $out;
}

function pos_sum_split_gst($rows, $shop, $partyGstinKey = "party_gstin", $partyStateKey = "party_state", $gstKey = "gst") {
  $cgst = 0;
  $sgst = 0;
  $igst = 0;
  foreach ($rows as $row) {
    $party = ["gstin" => $row[$partyGstinKey] ?? null, "state" => $row[$partyStateKey] ?? null];
    $inter = pos_is_inter_state_supply($shop, $party);
    $gst = isset($row[$gstKey])
      ? pos_gst_round2($row[$gstKey])
      : pos_line_gst_amount($row["amount"] ?? 0, $row["gst_rate"] ?? 0);
    $split = pos_split_gst_amount($gst, $inter);
    $cgst = pos_gst_round2($cgst + $split["cgst"]);
    $sgst = pos_gst_round2($sgst + $split["sgst"]);
    $igst = pos_gst_round2($igst + $split["igst"]);
  }
  return ["cgst" => $cgst, "sgst" => $sgst, "igst" => $igst, "total" => pos_gst_round2($cgst + $sgst + $igst)];
}

function pos_split_order_gst($order, $shop) {
  $inter = pos_is_inter_state_supply($shop, [
    "gstin" => $order["gstin"] ?? ($order["customer_gstin"] ?? null),
    "state" => $order["customer_state"] ?? null,
  ]);
  $split = pos_split_gst_amount($order["gst"] ?? 0, $inter);
  $split["interState"] = $inter;
  return $split;
}
