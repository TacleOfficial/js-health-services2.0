import Constants from "expo-constants";
import * as Notifications from "expo-notifications";

const allowedRoutes = [
  /^\/\(admin\)\/payments\/[0-9a-f-]{36}$/,
  /^\/\(admin\)\/orders\/[0-9a-f-]{36}$/,
  /^\/\(admin\)\/payments$/,
];

export function isAllowedAdminRoute(route: unknown): route is string {
  return typeof route === "string" && allowedRoutes.some((pattern) => pattern.test(route.split("?")[0]));
}

export async function getAdminPushToken() {
  const permission = await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted") return null;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId || projectId === "CONFIGURE_WITH_EAS_INIT") throw new Error("EAS project ID is not configured");
  return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}
