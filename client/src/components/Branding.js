// client/src/components/Branding.js
//
// Shared branding component. Renders the tenant's logo + name.
//
// Fallback chain (in order):
//   1. If company_logo_url is present AND the image loads → show logo + name
//   2. If logo missing or fails to load → show name only
//   3. If name also missing → show "EthioPOS"
//
// The parent passes `user` (from app state). We also accept an optional
// `companyName` / `companyLogoUrl` pair so the QR menu and any other
// surface can reuse this without requiring the full user object.

import React, { useState } from 'react';

const DEFAULT_NAME = 'EthioPOS';

const Branding = ({
  user,
  companyName,
  companyLogoUrl,
  size = 32,
  showName = true,
  className = '',
  nameClassName = 'text-xl font-bold text-gray-900 dark:text-white',
  logoClassName = 'flex-shrink-0 rounded-md object-contain bg-white dark:bg-gray-800'
}) => {
  // Prefer explicit props, fall back to the user object.
  const rawName =
    (companyName !== undefined && companyName !== null && companyName !== '')
      ? companyName
      : (user?.company_name || user?.companyName || '');

  const rawLogo =
    (companyLogoUrl !== undefined && companyLogoUrl !== null && companyLogoUrl !== '')
      ? companyLogoUrl
      : (user?.company_logo_url || user?.companyLogoUrl || '');

  const displayName = rawName && String(rawName).trim().length > 0
    ? String(rawName).trim()
    : DEFAULT_NAME;

  const [logoFailed, setLogoFailed] = useState(false);
  const hasLogo = rawLogo && String(rawLogo).trim().length > 0 && !logoFailed;

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {hasLogo ? (
        <img
          src={rawLogo}
          alt={displayName}
          width={size}
          height={size}
          className={logoClassName}
          style={{ width: size, height: size }}
          onError={() => setLogoFailed(true)}
        />
      ) : null}
      {showName ? (
        <h1 className={nameClassName}>{displayName}</h1>
      ) : null}
    </div>
  );
};

export default Branding;