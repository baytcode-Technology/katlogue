import * as supportRepository from '../repositories/support.repository.js';

export async function listAdminConversations() {
  return supportRepository.listAdminConversations();
}
