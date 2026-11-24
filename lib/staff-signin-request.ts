type SignInResult = {error?:string;staffOnly?:boolean;challenge?:string;message?:string;destination?:string};

/** Staff access is granted only by the backend after verifying an approved number's OTP. */
export async function staffSignInRequest(send:()=>Promise<Response>) {
 const response=await send();
 const result=await response.json() as SignInResult;
 return {response,result};
}
