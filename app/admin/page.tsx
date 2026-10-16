import {adminIdentity} from "../../lib/server";
import AdminApp from "./admin-app";
import AdminLogin from "./admin-login";
export const dynamic = "force-dynamic";
export default async function AdminPage() {
  try { await adminIdentity(); } catch { return <AdminLogin />; }
  return <AdminApp />;
}
