import React from 'react';
import UserPolicyPage from '@/shared/pages/UserPolicyPage';

// /user/support — customer Help & Support (guests and signed-in customers).
export default function UserSupportRoute() {
  return <UserPolicyPage type="support" />;
}
