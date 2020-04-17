class Room < ApplicationRecord
  belongs_to :account

  def type
    self.account.backend_type
  end
end
