"use client";
import type { ReactNode } from "react";
export default function AuthLink({href,children,className}:{href:string;children:ReactNode;className?:string}) {
 return <a href={href} className={className} target={process.env.NODE_ENV === "development" ? "_self" : "_top"} onClick={(event)=>{if(process.env.NODE_ENV === "development"){event.preventDefault();window.location.assign(event.currentTarget.href);}}}>{children}</a>;
}
