import React from 'react';
import UserPolicyPage from '@/shared/pages/UserPolicyPage';

// /user/terms — customer Terms of Service (guests and signed-in customers).
export default function UserTermsRoute() {
  return <UserPolicyPage type="terms" />;
}
