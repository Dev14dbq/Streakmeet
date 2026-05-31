package com.streakmeet.app;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.appcompat.app.AlertDialog;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "StreakLocationPermission",
    permissions = {
        @Permission(
            strings = {
                Manifest.permission.ACCESS_COARSE_LOCATION,
                Manifest.permission.ACCESS_FINE_LOCATION,
            },
            alias = "location"
        ),
        @Permission(
            strings = { Manifest.permission.ACCESS_BACKGROUND_LOCATION },
            alias = "backgroundLocation"
        ),
    }
)
public class StreakLocationPermissionPlugin extends Plugin {

    @PluginMethod
    public void checkAlways(PluginCall call) {
        PermissionState locState = getPermissionState("location");
        boolean foreground = locState == PermissionState.GRANTED;
        boolean background = Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
            || getPermissionState("backgroundLocation") == PermissionState.GRANTED;
        boolean denied = locState == PermissionState.DENIED
            || (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                && getPermissionState("backgroundLocation") == PermissionState.DENIED);

        JSObject ret = new JSObject();
        ret.put("granted", foreground && background);
        ret.put("foreground", foreground);
        ret.put("background", background);
        ret.put("denied", denied);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestAlways(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            requestPermissionForAlias("location", call, "afterForeground");
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
            && getPermissionState("backgroundLocation") != PermissionState.GRANTED) {
            requestPermissionForAlias("backgroundLocation", call, "afterBackground");
            return;
        }

        call.resolve(success());
    }

    @PermissionCallback
    private void afterForeground(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            call.reject("Location permission denied", "PERMISSION_DENIED");
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
            && getPermissionState("backgroundLocation") != PermissionState.GRANTED) {
            requestPermissionForAlias("backgroundLocation", call, "afterBackground");
            return;
        }

        call.resolve(success());
    }

    @PermissionCallback
    private void afterBackground(PluginCall call) {
        boolean background = Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
            || getPermissionState("backgroundLocation") == PermissionState.GRANTED;

        if (background) {
            call.resolve(success());
        } else {
            call.reject("Background location permission denied", "NOT_ALWAYS");
        }
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        openAppSettings();
        call.resolve();
    }

    /**
     * Custom explanatory dialog (Android). On confirm opens app settings for «Allow all the time».
     * Returns { action: "continue" | "settings" | "cancel" } — same contract as iOS.
     */
    @PluginMethod
    public void showAlwaysPrompt(PluginCall call) {
        String title = call.getString("title");
        if (title == null || title.isEmpty()) {
            title = "Location";
        }
        String message = call.getString("message");
        if (message == null) {
            message = "";
        }
        String cancelLabel = call.getString("cancelLabel");
        if (cancelLabel == null || cancelLabel.isEmpty()) {
            cancelLabel = "Cancel";
        }
        String actionLabel = call.getString("actionLabel");
        if (actionLabel == null || actionLabel.isEmpty()) {
            actionLabel = "Settings";
        }
        String actionType = call.getString("actionType");
        if (actionType == null || actionType.isEmpty()) {
            actionType = "settings";
        }
        final String resolvedActionType = actionType;

        getActivity().runOnUiThread(() -> {
            AlertDialog dialog = new AlertDialog.Builder(getContext())
                .setTitle(title)
                .setMessage(message)
                .setCancelable(true)
                .setNegativeButton(cancelLabel, (d, which) -> {
                    JSObject ret = new JSObject();
                    ret.put("action", "cancel");
                    call.resolve(ret);
                })
                .setPositiveButton(actionLabel, (d, which) -> {
                    if ("settings".equals(resolvedActionType)) {
                        openAppSettings();
                    }
                    JSObject ret = new JSObject();
                    ret.put("action", resolvedActionType);
                    call.resolve(ret);
                })
                .create();
            dialog.setOnCancelListener(d -> {
                JSObject ret = new JSObject();
                ret.put("action", "cancel");
                call.resolve(ret);
            });
            dialog.show();
        });
    }

    private void openAppSettings() {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        intent.setData(Uri.fromParts("package", getContext().getPackageName(), null));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
    }

    @PluginMethod
    public void openExternalUrl(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("Missing url");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getActivity().startActivity(intent);
        call.resolve();
    }

    private JSObject success() {
        JSObject ret = new JSObject();
        ret.put("granted", true);
        return ret;
    }
}
