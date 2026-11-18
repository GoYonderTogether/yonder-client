import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function prepareAndroidNotifications(android, source) {
	const app = join(android, "app");
	const firebaseConfig = join(app, "google-services.json");
	if (process.env.YONDER_FIREBASE_ANDROID_CONFIG) {
		copyFileSync(process.env.YONDER_FIREBASE_ANDROID_CONFIG, firebaseConfig);
	}

	const gradle = join(app, "build.gradle.kts");
	let build = readFileSync(gradle, "utf8");
	if (!build.includes('implementation("com.google.firebase:firebase-messaging:')) {
		build = build.replace(
			"dependencies {",
			'dependencies {\n    implementation("com.google.firebase:firebase-messaging:25.0.2")',
		);
	}
	if (existsSync(firebaseConfig) && !build.includes('id("com.google.gms.google-services")')) {
		build = build.replace("plugins {", 'plugins {\n    id("com.google.gms.google-services") version "4.4.4"');
	}
	writeFileSync(gradle, build);

	const manifest = join(app, "src/main/AndroidManifest.xml");
	let xml = readFileSync(manifest, "utf8");
	if (!xml.includes("android.permission.POST_NOTIFICATIONS")) {
		xml = xml.replace(
			"<application",
			'<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />\n    <application',
		);
	}
	if (!xml.includes(".YonderFirebaseMessagingService")) {
		xml = xml.replace(
			"</application>",
			`    <meta-data android:name="firebase_messaging_auto_init_enabled" android:value="false" />
        <meta-data android:name="com.google.firebase.messaging.default_notification_channel_id" android:value="messages" />
        <service android:name=".YonderFirebaseMessagingService" android:exported="false">
            <intent-filter>
                <action android:name="com.google.firebase.MESSAGING_EVENT" />
            </intent-filter>
        </service>
    </application>`,
		);
	}
	writeFileSync(manifest, xml);
	copyFileSync(
		join(source, "YonderNotificationsPlugin.kt"),
		join(app, "src/main/java/net/yonderbot/app/YonderNotificationsPlugin.kt"),
	);
}
