<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Cache-Control: no-cache, no-store, must-revalidate');

$configFile = __DIR__ . '/../data/version_config.json';

$defaultWin = 'https://ghazabegins.id/fotosync/downloads/FotoSync-Setup-Latest.exe';
$defaultMac = 'https://ghazabegins.id/fotosync/downloads/FotoSync-Setup-Latest.dmg';

$versionInfo = [
    'success' => true,
    'latest_version' => '1.2.0',
    'min_required_version' => '1.0.0',
    'download_url' => $defaultWin,
    'windows_download_url' => $defaultWin,
    'mac_download_url' => $defaultMac,
    'release_notes' => "• Pembaruan Live Shutter Connect: Auto-detect SD Card & Kabel USB Camera Direct (Windows & macOS)\n• Pop-up Modal Konfirmasi Otomatis saat SD Card / Kartu Memori Dicolokkan\n• Penyederhanaan Ingest Mode dan Perbaikan Filter IP Jaringan macOS",
    'is_mandatory' => false,
    'released_at' => date('Y-m-d')
];

if (file_exists($configFile)) {
    $content = file_get_contents($configFile);
    $data = json_decode($content, true);
    if ($data && is_array($data)) {
        if (empty($data['windows_download_url']) && !empty($data['download_url'])) {
            $data['windows_download_url'] = $data['download_url'];
        }
        if (empty($data['mac_download_url'])) {
            $data['mac_download_url'] = str_replace('.exe', '.dmg', $data['windows_download_url'] ?? $defaultMac);
        }
        echo json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        exit;
    }
}

echo json_encode($versionInfo, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
