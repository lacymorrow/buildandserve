// ! Don't use @/env here, it will break the build
import path from "path";
import { fileURLToPath } from "url";

// storage-adapter-import-placeholder
import { postgresAdapter } from "@payloadcms/db-postgres";
import { resendAdapter } from "@payloadcms/email-resend";
import { payloadCloudPlugin } from "@payloadcms/payload-cloud";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { buildConfig } from "payload";
import sharp from "sharp";

// Import components using path strings for Payload 3.0
// We'll use component paths instead of direct imports
import { FAQs } from "./lib/payload/collections/FAQs";
import { Features } from "./lib/payload/collections/Features";
import { Media } from "./lib/payload/collections/Media";
import { Pages } from "./lib/payload/collections/Pages";
import { RBAC } from "./lib/payload/collections/RBAC";
import { Testimonials } from "./lib/payload/collections/Testimonials";
import { Users } from "./lib/payload/collections/Users";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

export default buildConfig({
	secret: process.env.PAYLOAD_SECRET ?? process.env.AUTH_SECRET ?? "supersecret",
	routes: {
		admin: "/cms",
		api: "/cms-api",
	},
	admin: {
		user: Users.slug,
		importMap: {
			baseDir: path.resolve(dirname),
		},
		// Add custom branding configuration
		meta: {
			titleSuffix: "- ShipKit CMS",
			// Use the new icons format for favicon
			icons: [
				{
					rel: "icon",
					type: "image/x-icon",
					url: "/favicon.ico",
				},
			],
			// Use the new openGraph format for ogImage
			openGraph: {
				images: [
					{
						url: "/og",
					},
				],
				siteName: "ShipKit CMS",
			},
		},
		components: {
			// Use component paths for graphics
			graphics: {
				Logo: "./lib/payload/components/logo",
				Icon: "./lib/payload/components/icon",
			},
		},
	},
	collections: [Users, Media, Features, FAQs, Testimonials, RBAC, Pages],
	editor: lexicalEditor(),
	typescript: {
		outputFile: path.resolve(dirname, "payload-types.ts"),
	},
	// ! Database
	// This allows us to use the same database for Payload and the application, payload will use a different schema.
	db: postgresAdapter({
		schemaName: "payload",
		pool: {
			connectionString: process.env.DATABASE_URL ?? "",
		},
		beforeSchemaInit: [
			({ schema, adapter }: { schema: any; adapter: any }) => {
				/*
				 * Define relationships between Payload and application tables
				 * Only add relationships that are actually needed
				 *
				 * Key relationships:
				 * 1. Users - for authentication and user management
				 * 2. RBAC - for permissions and access control
				 * 3. Media - for asset management
				 * 4. Content - for content management
				 */
				return {
					...schema,
					tables: {
						...schema.tables,
						// Users relationship - core authentication and user management
						users: {
							...schema.tables.users,
							relationships: [
								{
									relationTo: "public.shipkit_user",
									type: "oneToOne",
									onDelete: "CASCADE", // Delete app user when Payload user is deleted
								},
							],
						},
						// RBAC relationship - permissions and access control
						rbac: {
							...schema.tables.rbac,
							relationships: [
								{
									relationTo: "public.shipkit_role",
									type: "oneToMany",
								},
								// Enhanced relationship to permissions
								{
									relationTo: "public.shipkit_permission",
									type: "oneToMany",
								},
							],
						},
						// Media relationship - for asset management
						media: {
							...schema.tables.media,
							relationships: [
								{
									relationTo: "public.shipkit_user_file",
									type: "oneToMany",
								},
							],
						},
						// Pages relationship - for content management
						pages: {
							...schema.tables.pages,
							relationships: [
								{
									relationTo: "public.shipkit_post",
									type: "oneToMany",
								},
							],
						},
					},
				};
			},
		],
		migrationDir: path.resolve(dirname, "migrations"),
	}),
	sharp,
	plugins: [
		payloadCloudPlugin(),
		// storage-adapter-placeholder
	],
	telemetry: false,

	// If AUTH_RESEND_KEY is set, use the resend adapter
	...(process.env.AUTH_RESEND_KEY
		? {
				email: resendAdapter({
					defaultFromAddress: "dev@payloadcms.com",
					defaultFromName: "Payload CMS",
					apiKey: process.env.AUTH_RESEND_KEY || "",
				}),
			}
		: {}),
});
