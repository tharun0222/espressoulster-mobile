// Clear both local identities, then terminate any underlying hosted session too.
export async function signOutSession(api: (path: string, method?: string, data?: any) => Promise<any>, provider?:string) {
  if(provider==='pin'){
    await api('auth/pin/logout','POST',{});
    return '/#home';
  }
  const results = await Promise.allSettled([
    api("auth/pin/logout", "POST", {}),
    api("auth/admin/logout", "POST", {}),
    api("auth/phone/logout", "POST", {}),
    api("tester-session/logout", "POST", {}),
  ]);
  const failure = results.find(result => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
  const bootstrap = await api("bootstrap");
  return bootstrap.user ? "/signout-with-chatgpt?return_to=%2F%23home" : "/#home";
}
