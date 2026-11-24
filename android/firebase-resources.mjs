import { readFileSync, writeFileSync } from 'node:fs';

const [file, packageName, output] = process.argv.slice(2);
try {
  const config = JSON.parse(readFileSync(file, 'utf8'));
  const client = config.client?.find(entry => entry.client_info?.android_client_info?.package_name === packageName);
  const values = {
    google_app_id: client?.client_info?.mobilesdk_app_id,
    google_api_key: client?.api_key?.[0]?.current_key,
    gcm_defaultSenderId: config.project_info?.project_number,
    project_id: config.project_info?.project_id,
  };
  if (Object.values(values).some(value => typeof value !== 'string' || !/^[A-Za-z0-9:_-]+$/.test(value))) throw Error();
  const resources = Object.entries(values).map(([name, value]) =>
    `    <string name="${name}" translatable="false">${value}</string>`).join('\n');
  writeFileSync(output, `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n${resources}\n</resources>\n`);
} catch {
  console.error(`Provide the Firebase Android app configuration for ${packageName}.`);
  process.exitCode = 1;
}
