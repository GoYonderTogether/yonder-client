import assert from "node:assert/strict";
import { test } from "node:test";
import { updateManifest } from "../../apps/desktop/android/prepare-update.mjs";

test("Android installer permission survives regeneration and reuses Tauri FileProvider", () => {
	const input = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n<application><provider android:authorities="\${applicationId}.fileprovider" /></application>\n</manifest>`;
	const manifest = updateManifest(input);
	assert.match(manifest, /android\.permission\.REQUEST_INSTALL_PACKAGES/);
	assert.match(manifest, /android:authorities="\$\{applicationId\}\.fileprovider"/);
	assert.equal(updateManifest(manifest), manifest);
	assert.throws(() => updateManifest("<manifest/>"), /no Tauri FileProvider/);
});
