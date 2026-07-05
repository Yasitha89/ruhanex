# Define variables
$KEY = "~/.ssh/id_ed25519"
$SERVER = "ubuntu@34.235.63.22"
$LOCAL_DIST = "dist"
$REMOTE_TEMP = "/home/ubuntu/"
$WEB_DIR = "/var/www/ruhanexweb"

Write-Host "Step 1: Uploading local dist folder to server..." -ForegroundColor Cyan
scp -i $KEY -r $LOCAL_DIST "${SERVER}:${REMOTE_TEMP}"

Write-Host "Step 2: Moving files to web directory and cleaning up..." -ForegroundColor Cyan
ssh -i $KEY $SERVER "sudo cp -r ${REMOTE_TEMP}/* ${WEB_DIR}/ && rm -rf ${REMOTE_TEMP} && echo 'Server-side deployment complete!'"

Write-Host "All done! Deployment successful." -ForegroundColor Green
