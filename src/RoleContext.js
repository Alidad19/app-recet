import React from 'react';

// الدور الأساسي للتطبيق: صاحب مولدة أو مشغل.
// يُقرأ من مستند devices/{deviceId} في App.js ويُمرر لكل الشاشات.
export const RoleContext = React.createContext('owner');

export const useRole = () => React.useContext(RoleContext);

export const isOperator = (role) => role === 'operator';
