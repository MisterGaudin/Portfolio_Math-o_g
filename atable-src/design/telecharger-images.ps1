# À TABLE ! — range les illustrations générées sur Higgsfield dans le dossier de l'association.
# Clic droit sur ce fichier > « Exécuter avec PowerShell » (ou : powershell -ExecutionPolicy Bypass -File telecharger-images.ps1)
$Racine = "D:\00_Association\PRODUITS\A Table"

# Arborescence : un dossier par région pour les plats, puis Régions, Chefs, Spéciales et Maquettes.
$Dossiers = @("Plats\BRE Bretagne", "Plats\NMD Normandie", "Plats\NRD Nord", "Plats\ALS Alsace", "Plats\LOR Lorraine",
  "Plats\BOU Bourgogne", "Plats\SAV Savoie", "Plats\LYO Lyonnais", "Plats\AUV Auvergne", "Plats\PRO Provence",
  "Plats\COR Corse", "Plats\SDO Sud-Ouest", "Regions", "Chefs", "Speciales", "Maquettes", "Essais")
foreach ($d in $Dossiers) { New-Item -ItemType Directory -Force -Path (Join-Path $Racine $d) | Out-Null }

# Fichier de destination => adresse de l'image sur Higgsfield.
$Images = [ordered]@{
  "Plats\BRE Bretagne\bretagne-fromage_v1.png" = "https://d8j0ntlcm91z4.cloudfront.net/user_3H5QdrLFnZuOx1dW610wt89Rfwe/hf_20261012_140314_05473772-c9e1-4f9b-bdf3-4a3aa649f576.png"
  "Plats\BRE Bretagne\bretagne-fromage_v2.png" = "https://d8j0ntlcm91z4.cloudfront.net/user_3H5QdrLFnZuOx1dW610wt89Rfwe/hf_20261012_140314_14bfca1e-ede0-409d-bbb4-bc291e85b2d7.png"
  "Essais\cure-nantais_contours_a.png" = "https://d8j0ntlcm91z4.cloudfront.net/user_3H5QdrLFnZuOx1dW610wt89Rfwe/hf_20261012_135736_1938bafa-2bc8-47d7-8f3e-222d949ff8b7.png"
  "Essais\cure-nantais_contours_b.png" = "https://d8j0ntlcm91z4.cloudfront.net/user_3H5QdrLFnZuOx1dW610wt89Rfwe/hf_20261012_135738_6c2361b1-a719-4cb3-bad1-f014edf19b0e.png"
  "Essais\chef-renard_essai.png" = "https://d8j0ntlcm91z4.cloudfront.net/user_3H5QdrLFnZuOx1dW610wt89Rfwe/hf_20261012_135010_7dd377a1-fb7a-44ae-9c1f-ba8614aec67c.png"
}
foreach ($f in $Images.Keys) {
  $dest = Join-Path $Racine $f
  Write-Host "Téléchargement de $f"
  Invoke-WebRequest -Uri $Images[$f] -OutFile $dest -UseBasicParsing
}
Write-Host "Terminé : $Racine"
