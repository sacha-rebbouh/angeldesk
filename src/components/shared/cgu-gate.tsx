"use client";

import { memo, useState, useCallback } from "react";
import { CguConsentModal } from "@/components/shared/cgu-consent-modal";

/**
 * Client-side gate that shows the CGU consent modal if user hasn't accepted yet.
 * Wraps children and overlays the modal when needed.
 */
export const CguGate = memo(function CguGate({
  needsConsent,
  children,
}: {
  needsConsent: boolean;
  children: React.ReactNode;
}) {
  const [showModal, setShowModal] = useState(needsConsent);

  const handleAccepted = useCallback(() => {
    setShowModal(false);
  }, []);

  return (
    <>
      {children}
      {showModal && <CguConsentModal onAccepted={handleAccepted} />}
    </>
  );
});

CguGate.displayName = "CguGate";
