class Room < ApplicationRecord
  belongs_to :account

  def type
    self.account.backend_type
  end

  def allow_user(user_id)
  end

  def user_allowed?(user_id)
    true
  end

  def in_use
  end
end
