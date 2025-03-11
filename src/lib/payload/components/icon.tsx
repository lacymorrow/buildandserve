// Simple component that returns JSX
const Icon = () => {
	return (
		<div className="shipkit-icon">
			<svg
				width="100%"
				height="100%"
				viewBox="0 0 40 40"
				fill="none"
				xmlns="http://www.w3.org/2000/svg"
			>
				{/* Space-themed background */}
				<rect width="40" height="40" rx="8" fill="#0F172A" />

				{/* Stars */}
				<circle cx="10" cy="10" r="1" fill="white" opacity="0.7" />
				<circle cx="30" cy="8" r="0.8" fill="white" opacity="0.5" />
				<circle cx="25" cy="32" r="1.2" fill="white" opacity="0.8" />
				<circle cx="8" cy="28" r="0.7" fill="white" opacity="0.6" />

				{/* Rocket icon */}
				<path
					d="M20 15C20 15 23 12 23 8C23 4 20 1 20 1C20 1 17 4 17 8C17 12 20 15 20 15Z"
					fill="#3B82F6"
				/>
				<path
					d="M20 15C20 15 17 18 17 22C17 26 20 29 20 29C20 29 23 26 23 22C23 18 20 15 20 15Z"
					fill="#3B82F6"
					opacity="0.8"
				/>

				{/* Flame trails */}
				<path
					d="M18 30C18 30 17 32 17 34C17 36 18 38 18 38C18 38 19 36 19 34C19 32 18 30 18 30Z"
					fill="#F59E0B"
					opacity="0.9"
				/>
				<path
					d="M22 30C22 30 21 32 21 34C21 36 22 38 22 38C22 38 23 36 23 34C23 32 22 30 22 30Z"
					fill="#F59E0B"
					opacity="0.9"
				/>
			</svg>
		</div>
	);
};

export default Icon;
