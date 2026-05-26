#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(StreakLocationPermissionPlugin, "StreakLocationPermission",
    CAP_PLUGIN_METHOD(checkAlways, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(requestAlways, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(openSettings, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(openExternalUrl, CAPPluginReturnPromise);
)
