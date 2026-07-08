import { redirect } from "next/navigation";

// The canvas moved to /canvas when woodpeckeros.com launched.
export default function V2Redirect() {
  redirect("/canvas");
}
