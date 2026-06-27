import * as supportRepository from '../repositories/support.repository.js';

export async function getAdminSummary() {
  return supportRepository.getAdminSummary();
}
