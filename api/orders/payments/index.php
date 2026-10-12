<?php
$id = $_GET["id"] ?? "";
$_GET["p"] = $id !== "" ? ("orders/" . $id . "/payments") : "orders";
require dirname(__DIR__, 3) . "/pos-api.php";
