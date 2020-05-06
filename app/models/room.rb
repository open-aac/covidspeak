class Room < ApplicationRecord
  include SecureSerialize
  secure_serialize :settings

  belongs_to :account

  def type
    self.account.backend_type
  end

  def self.find_by_code(code)
    code = code.sub(/^VidChatFor-/, '')
    find_by(code: code)
  end

  def throttled?
    !!@throttled
  end

  def self.throttle_response(throttle)
    res = Room.new
    res.instance_variable_set('@throttled', throttle)
    res
  end

  def allow_user(user_id)
    self.settings ||= {}
    self.settings['allowed_user_ids'] ||= []
    self.settings['allowed_user_ids'] << user_id
    self.settings['allowed_user_ids'].uniq!
    self.save!
  end

  def user_allowed?(user_id)
    ((self.settings || {})['allowed_user_ids'] || []).include?(user_id)
  end

  def in_use
    self.settings ||= {}
    now = Time.now.to_i
    if self.settings['ended_at'] && self.settings['ended_at'] < now - (5 * 60)
      # if more than 5 minutes of inactivity, note the gap in timing
      self.settings['gaps'] ||= []
      self.settings['gaps'] << {
        'from' => self.settings['ended_at'],
        'to' => now - 30,
        'duration' => (now - self.settings['ended_at'])
      }
    end
    self.settings['started_at'] ||= now
    self.settings['ended_at'] = now
    self.settings['duration'] = self.settings['ended_at'] - self.settings['started_at'] - (self.settings['gaps'] || []).map{|g| g['duration'] || 0}.sum
    self.save
  end
end
