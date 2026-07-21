export type UserPrincipal = {
  type: 'user';
  subject: string;
};

export type AdminPrincipal = {
  type: 'admin';
  subject: string;
  role: 'admin' | 'superadmin';
};

export type Principal = UserPrincipal | AdminPrincipal;
