import { Navigate } from 'react-router-dom';

const AddressSettings = () => (
  <Navigate
    to="/food/user/address-selector"
    replace
    state={{ from: '/taxi/user/profile', ui: 'taxi' }}
  />
);

export default AddressSettings;
