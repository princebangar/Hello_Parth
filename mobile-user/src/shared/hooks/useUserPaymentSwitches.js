import { useMemo } from 'react';
import usePublicCustomization from './usePublicCustomization.js';

/**
 * Customer payment methods the Global admin has switched on or off for the whole app
 * (Global > Customization Settings > User Global COD / User Wallet Payment / User Online Payment).
 * Returns `{ cod, wallet, online }`; all true until the first answer arrives. The server enforces the same switches.
 */
const selectKey = (settings) =>
  [settings.user_cod_enabled, settings.user_wallet_enabled, settings.user_online_enabled]
    .map((flag) => (flag === false ? '0' : '1'))
    .join('');

export default function useUserPaymentSwitches() {
  const key = usePublicCustomization(selectKey);
  return useMemo(() => ({ cod: key[0] === '1', wallet: key[1] === '1', online: key[2] === '1' }), [key]);
}
