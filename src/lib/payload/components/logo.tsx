// Simple component that returns JSX
const Logo = () => {
	return (
		<div className="shipkit-logo" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center' }}>
			<svg
				width="100%"
				height="100%"
				viewBox="0 0 150 40"
				fill="none"
				xmlns="http://www.w3.org/2000/svg"
				style={{ maxWidth: '150px', maxHeight: '40px' }}
			>
				{/* Space-themed background with stars */}
				<rect width="150" height="40" rx="8" fill="#0F172A" />

				{/* Stars */}
				<circle cx="20" cy="10" r="1" fill="white" opacity="0.7" />
				<circle cx="40" cy="15" r="0.8" fill="white" opacity="0.5" />
				<circle cx="60" cy="8" r="1.2" fill="white" opacity="0.8" />
				<circle cx="80" cy="12" r="0.7" fill="white" opacity="0.6" />
				<circle cx="100" cy="7" r="1" fill="white" opacity="0.7" />
				<circle cx="120" cy="14" r="0.9" fill="white" opacity="0.5" />
				<circle cx="140" cy="9" r="1.1" fill="white" opacity="0.8" />

				{/* Rocket icon */}
				<path
					d="M30 20C30 20 33 17 33 13C33 9 30 6 30 6C30 6 27 9 27 13C27 17 30 20 30 20Z"
					fill="#3B82F6"
				/>
				<path
					d="M30 20C30 20 27 23 27 27C27 31 30 34 30 34C30 34 33 31 33 27C33 23 30 20 30 20Z"
					fill="#3B82F6"
					opacity="0.8"
				/>

				{/* ShipKit text */}
				<text
					x="75"
					y="24"
					fontFamily="Arial"
					fontSize="16"
					fontWeight="bold"
					fill="white"
					textAnchor="middle"
				>
					ShipKit CMS
				</text>
			</svg>
		</div>
	);
};

export default Logo;
