package com.hoodyboody.livechat;

import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "HoodyBoodyNotifications")
public class HoodyBoodyNotificationsPlugin extends Plugin {
    private static final String DEFAULT_CHANNEL_ID = "hoodyboody_live_chat_v2";
    private static final String PREFS_NAME = "hoodyboody_notifications";
    private static final String SOUND_URI_KEY = "sound_uri";
    private static final String CHANNEL_ID_KEY = "channel_id";

    @PluginMethod
    public void isFirebaseConfigured(PluginCall call) {
        int googleAppId = getContext().getResources().getIdentifier("google_app_id", "string", getContext().getPackageName());
        JSObject result = new JSObject();
        result.put("configured", googleAppId != 0);
        call.resolve(result);
    }

    @PluginMethod
    public void getSelectedNotificationSound(PluginCall call) {
        JSObject result = new JSObject();
        Uri soundUri = getSavedSoundUri();
        result.put("channelId", getSavedChannelId());
        result.put("soundUri", soundUri == null ? "" : soundUri.toString());
        result.put("soundTitle", getSoundTitle(soundUri));
        result.put("selected", soundUri != null);
        call.resolve(result);
    }

    @PluginMethod
    public void applySavedNotificationSound(PluginCall call) {
        Uri soundUri = getSavedSoundUri();
        String channelId = getSavedChannelId();
        if (soundUri != null) {
            recreateSoundChannel(channelId, soundUri);
        }

        JSObject result = new JSObject();
        result.put("channelId", channelId);
        result.put("soundUri", soundUri == null ? "" : soundUri.toString());
        result.put("soundTitle", getSoundTitle(soundUri));
        result.put("selected", soundUri != null);
        call.resolve(result);
    }

    @PluginMethod
    public void chooseNotificationSound(PluginCall call) {
        Intent intent = new Intent(RingtoneManager.ACTION_RINGTONE_PICKER);
        Uri existingUri = getSavedSoundUri();

        intent.putExtra(RingtoneManager.EXTRA_RINGTONE_TYPE, RingtoneManager.TYPE_NOTIFICATION);
        intent.putExtra(RingtoneManager.EXTRA_RINGTONE_TITLE, "Choose chat notification sound");
        intent.putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_DEFAULT, true);
        intent.putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_SILENT, false);
        intent.putExtra(RingtoneManager.EXTRA_RINGTONE_DEFAULT_URI, RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION));
        intent.putExtra(RingtoneManager.EXTRA_RINGTONE_EXISTING_URI, existingUri == null ? RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION) : existingUri);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

        startActivityForResult(call, intent, "soundPickerResult");
    }

    @ActivityCallback
    private void soundPickerResult(PluginCall call, ActivityResult result) {
        if (call == null) return;

        if (result.getResultCode() != Activity.RESULT_OK) {
            JSObject response = new JSObject();
            response.put("selected", false);
            response.put("channelId", getSavedChannelId());
            call.resolve(response);
            return;
        }

        Intent data = result.getData();
        Uri soundUri = data == null ? null : data.getParcelableExtra(RingtoneManager.EXTRA_RINGTONE_PICKED_URI);
        if (soundUri == null) soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);

        String channelId = buildSoundChannelId(soundUri);
        saveSound(soundUri, channelId);
        recreateSoundChannel(channelId, soundUri);

        JSObject response = new JSObject();
        response.put("selected", true);
        response.put("channelId", channelId);
        response.put("soundUri", soundUri.toString());
        response.put("soundTitle", getSoundTitle(soundUri));
        call.resolve(response);
    }

    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        String channelId = call.getString("channelId", getSavedChannelId());
        if (DEFAULT_CHANNEL_ID.equals(channelId)) channelId = getSavedChannelId();
        Intent intent;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            intent = new Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS);
            intent.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
            intent.putExtra(Settings.EXTRA_CHANNEL_ID, channelId);
        } else {
            intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(android.net.Uri.parse("package:" + getContext().getPackageName()));
        }

        getActivity().startActivity(intent);

        JSObject result = new JSObject();
        result.put("opened", true);
        call.resolve(result);
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    private Uri getSavedSoundUri() {
        String value = prefs().getString(SOUND_URI_KEY, "");
        if (value == null || value.trim().isEmpty()) return null;
        return Uri.parse(value);
    }

    private String getSavedChannelId() {
        String value = prefs().getString(CHANNEL_ID_KEY, DEFAULT_CHANNEL_ID);
        if (value == null || value.trim().isEmpty()) return DEFAULT_CHANNEL_ID;
        return value;
    }

    private void saveSound(Uri soundUri, String channelId) {
        prefs()
            .edit()
            .putString(SOUND_URI_KEY, soundUri.toString())
            .putString(CHANNEL_ID_KEY, channelId)
            .apply();
    }

    private String buildSoundChannelId(Uri soundUri) {
        String hash = Integer.toHexString(Math.abs(soundUri.toString().hashCode()));
        return "hoodyboody_live_chat_sound_" + hash;
    }

    private String getSoundTitle(Uri soundUri) {
        if (soundUri == null) return "";

        try {
            Ringtone ringtone = RingtoneManager.getRingtone(getContext(), soundUri);
            if (ringtone == null) return "Selected sound";
            return ringtone.getTitle(getContext());
        } catch (Exception ignored) {
            return "Selected sound";
        }
    }

    private void recreateSoundChannel(String channelId, Uri soundUri) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || soundUri == null) return;

        NotificationManager manager = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        NotificationChannel existing = manager.getNotificationChannel(channelId);
        if (existing != null) manager.deleteNotificationChannel(channelId);

        AudioAttributes audioAttributes = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();
        NotificationChannel channel = new NotificationChannel(channelId, "Customer messages", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Sound alerts for new HOODYBOODY customer chat messages.");
        channel.setSound(soundUri, audioAttributes);
        channel.enableVibration(true);
        channel.enableLights(true);
        channel.setLightColor(Color.rgb(176, 141, 87));
        manager.createNotificationChannel(channel);
    }
}
