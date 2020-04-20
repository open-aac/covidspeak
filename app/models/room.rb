class Room < ApplicationRecord
  belongs_to :account

  def type
    self.account.backend_type
  end

  def self.find_by_code(code)
    code = code.sub(/^CoVidChatFor/, '')
    find_by(code: code)
  end

  def allow_user(user_id)
  end

  def user_allowed?(user_id)
    true
  end

  def in_use
  end
end
