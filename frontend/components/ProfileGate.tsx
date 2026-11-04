"use client";

import { createContext, useContext } from "react";
import { BTN_PRIMARY } from "./styles";

/**
 * Whether the account may add things yet (Part 12, R54).
 *
 * An account with no profile can look around and look a food up, but it cannot create an entry, a food or a
 * meal. The server is the one that refuses; this only lets the screen say so before the person has filled in a
 * form, instead of after. It is a context because five dialogs need it and none of them is near the app's
 * profile, and its default is "may add", so a dialog shown on its own (or under a test) behaves as before.
 */
export interface ProfileGateValue {
  /** True only when the server has said there is no profile. Not true while that is unknown. */
  needProfile: boolean;
  openProfile: () => void;
}

const MAY_ADD: ProfileGateValue = {
  needProfile: false,
  openProfile: () => undefined,
};

export const ProfileGateContext = createContext<ProfileGateValue>(MAY_ADD);

export function useProfileGate(): ProfileGateValue {
  return useContext(ProfileGateContext);
}

/**
 * The line at the top of a creating dialog when there is no profile yet.
 *
 * The dialog stays open, because looking a food up is still allowed, and its add or create button is
 * disabled. The link closes this dialog first, then opens the profile one: two dialogs on top of each other
 * would both answer the Escape key.
 */
export function NeedProfileNotice({ onClose }: { onClose: () => void }) {
  const { needProfile, openProfile } = useProfileGate();
  if (!needProfile) return null;

  return (
    <div
      className="d-flex flex-wrap align-items-center gap-2 border border-ember rounded-3 p-2 mb-3"
      data-testid="need-profile"
    >
      <span className="small flex-grow-1">
        A profile comes first, because everything you log is measured against
        it. Set it up to add anything. You can still look foods up.
      </span>
      <button
        type="button"
        className={BTN_PRIMARY}
        data-testid="need-profile-open"
        onClick={() => {
          onClose();
          openProfile();
        }}
      >
        Set up your profile
      </button>
    </div>
  );
}
