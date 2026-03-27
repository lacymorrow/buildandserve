import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { BASE_URL } from "../../config/base-url";
import { SEARCH_PARAM_KEYS } from "../../config/search-param-keys";
import { logger } from "../logger";

<<<<<<< HEAD:src/lib/utils/redirect-with-code.ts
interface RedirectWithCodeOptions {
	code?: string;
	nextUrl?: string;
||||||| bac2439d:src/lib/utils/redirect.ts
interface RedirectOptions {
	code?: string;
	nextUrl?: string;
=======
interface RedirectOptions {
  code?: string;
  nextUrl?: string;
>>>>>>> upstream/main:src/lib/utils/redirect.ts
}

<<<<<<< HEAD:src/lib/utils/redirect-with-code.ts
export const redirectWithCode = (url: string, options?: RedirectWithCodeOptions) => {
	const { code, nextUrl } = options ?? {};
	const redirectUrl = new URL(url, BASE_URL);
||||||| bac2439d:src/lib/utils/redirect.ts
export function createRedirectUrl(pathname: string, options?: RedirectOptions): string {
	const url = new URL(pathname, BASE_URL);
	if (options?.code) {
		url.searchParams.set(SEARCH_PARAM_KEYS.statusCode, options.code);
	}
	if (options?.nextUrl) {
		url.searchParams.set(SEARCH_PARAM_KEYS.nextUrl, options.nextUrl);
	}
	return url.pathname + url.search;
}
=======
export function createRedirectUrl(pathname: string, options?: RedirectOptions): string {
  const url = new URL(pathname, BASE_URL);
  if (options?.code) {
    url.searchParams.set(SEARCH_PARAM_KEYS.statusCode, options.code);
  }
  if (options?.nextUrl) {
    url.searchParams.set(SEARCH_PARAM_KEYS.nextUrl, options.nextUrl);
  }
  return url.pathname + url.search;
}
>>>>>>> upstream/main:src/lib/utils/redirect.ts

<<<<<<< HEAD:src/lib/utils/redirect-with-code.ts
	if (code) {
		redirectUrl.searchParams.set("code", code);
	}
||||||| bac2439d:src/lib/utils/redirect.ts
export function redirect(pathname: string, options?: RedirectOptions) {
	const url = createRedirectUrl(pathname, options);
	return nextRedirect(url);
}
=======
export function redirect(pathname: string, options?: RedirectOptions) {
  const url = createRedirectUrl(pathname, options);
  return nextRedirect(url);
}
>>>>>>> upstream/main:src/lib/utils/redirect.ts

<<<<<<< HEAD:src/lib/utils/redirect-with-code.ts
	if (nextUrl) {
		redirectUrl.searchParams.set(SEARCH_PARAM_KEYS.nextUrl, nextUrl);
	}

	return redirect(redirectUrl.toString());
};

export const routeRedirectWithCode = (
	destination: string,
	options?: string | { code?: string; nextUrl?: string; request?: Request }
) => {
	if (!options) {
		return NextResponse.redirect(destination);
	}
||||||| bac2439d:src/lib/utils/redirect.ts
export function routeRedirect(
	destination: string,
	options?: string | { code?: string; nextUrl?: string; request?: Request }
) {
	if (!options) {
		return NextResponse.redirect(destination);
	}
=======
export function routeRedirect(
  destination: string,
  options?: string | { code?: string; nextUrl?: string; request?: Request }
) {
  if (!options) {
    return NextResponse.redirect(destination);
  }
>>>>>>> upstream/main:src/lib/utils/redirect.ts

  let url: URL;

<<<<<<< HEAD:src/lib/utils/redirect-with-code.ts
	if (typeof options === "string") {
		url = new URL(destination, BASE_URL);
		url.searchParams.set(SEARCH_PARAM_KEYS.statusCode, options);
	} else {
		// Use BASE_URL as fallback if request.url is not available
		const baseUrl = options.request?.url || BASE_URL;
		url = new URL(destination, baseUrl);
||||||| bac2439d:src/lib/utils/redirect.ts
	if (typeof options === "string") {
		url = new URL(destination, BASE_URL);
		url.searchParams.set(SEARCH_PARAM_KEYS.statusCode, options);
	} else {
		const baseUrl = options.request?.url || BASE_URL;
		url = new URL(destination, baseUrl);
=======
  if (typeof options === "string") {
    url = new URL(destination, BASE_URL);
    url.searchParams.set(SEARCH_PARAM_KEYS.statusCode, options);
  } else {
    const baseUrl = options.request?.url || BASE_URL;
    url = new URL(destination, baseUrl);
>>>>>>> upstream/main:src/lib/utils/redirect.ts

    if (options?.nextUrl) {
      url.searchParams.set(SEARCH_PARAM_KEYS.nextUrl, options.nextUrl);
    }

    if (options?.code) {
      url.searchParams.set(SEARCH_PARAM_KEYS.statusCode, options.code);
    }
  }

<<<<<<< HEAD:src/lib/utils/redirect-with-code.ts
	logger.info(`serverRedirectWithCode: Redirecting to ${url}`);
	return NextResponse.redirect(url);
};
||||||| bac2439d:src/lib/utils/redirect.ts
	logger.info(`routeRedirect: Redirecting to ${url}`);
	return NextResponse.redirect(url);
}
=======
  logger.info(`routeRedirect: Redirecting to ${url}`);
  return NextResponse.redirect(url);
}

>>>>>>> upstream/main:src/lib/utils/redirect.ts
