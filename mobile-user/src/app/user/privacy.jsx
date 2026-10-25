import React from 'react';
import UserPolicyPage from '@/shared/pages/UserPolicyPage';

// /user/privacy — customer Privacy Policy (guests and signed-in customers).
export default function UserPrivacyRoute() {
  return <UserPolicyPage type="privacy" />;
}
