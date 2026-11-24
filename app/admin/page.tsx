import {adminIdentity, canManageStaffDuty, canManageStaffOrders} from "../../lib/server";
import AdminApp from "./admin-app";
import AdminLogin from "./admin-login";
import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {adminOrderLink,adminSection,sampleCarouselPreview} from "../../lib/admin-section";
import {androidAdminAccess, androidAdminRequired, localStaffPreview, localStaffPreviewPin, staffPhoneAuthRequired, staffOtpDeviceIndependent} from "../../lib/android-admin-access";
export const dynamic = "force-dynamic";
export default async function AdminPage({ searchParams }: { searchParams: Promise<{ section?: string | string[]; preview?: string | string[]; order?: string | string[] }> }) {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host");
  const verifiedAndroid = await androidAdminAccess(requestHeaders.get("cookie"));
  const localStaff = localStaffPreview(host);
  const otpDevices = staffOtpDeviceIndependent();
  const params = await searchParams;
  const section = adminSection(params.section);
  const order = section === "orders" ? adminOrderLink(params.order) : undefined;
  const previewSamples = localStaff && section === "advertising" && params.preview === sampleCarouselPreview;
  if (!otpDevices && !verifiedAndroid && (androidAdminRequired() || (!localStaff && staffPhoneAuthRequired(host)))) {
    return <main className="admin-signin-page"><section className="admin-signin-card">
      <h1>Open Café Admin in the Android app</h1>
      <p>Press and hold the Espressoulster Coffee app icon, then tap Café Admin.</p>
    </section></main>;
  }
  try {
    const user = await adminIdentity();
    const canManageOrders = canManageStaffOrders(user);
    return <div className={localStaff ? "admin-layout admin-phone-preview" : "admin-layout"}>
      <AdminApp initialTab={section} initialOrder={order} previewAdvertisingSamples={previewSamples} staffSession={user.authProvider === "staff-pin"} canManageOrders={canManageOrders}
        canManageDuty={canManageStaffDuty(user)}
        signOutToApp={Boolean(localStaffPreviewPin(host))}
        receiveOrderAlerts={canManageOrders && (otpDevices || verifiedAndroid || localStaff)} />
    </div>;
  } catch {
    if (otpDevices || verifiedAndroid || localStaff) redirect(`/?signIn=1&switchAccount=1${section ? `&section=${section}` : ""}${order ? `&order=${order}` : ""}${previewSamples ? `&preview=${sampleCarouselPreview}` : ""}#home`);
    return <AdminLogin />;
  }
}
