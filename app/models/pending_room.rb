class PendingRoom < ApplicationRecord
  include SecureSerialize
  secure_serialize :settings
  belongs_to :account

  before_save :generate_defaults

  def generate_defaults
    self.settings ||= {}
    self.settings['name'] = "Scheduled Room" if self.settings['name'].blank?
    self.settings['nonce'] ||= GoSecure.nonce('pending_room_nonce')
    self.settings['as_communicator'] ||= false
    self.activated ||= false
    true
  end

  def activate
    raise "already activated" if self.activated
    self.activated = true
    identity = Account.generate_user(nil, self.code)
    res = self.account.generate_room(identity)
    if res && !res.throttled?
      trimmed_identity = identity.split(/:/)[0, 2].join(':')
      res.user_accessed(trimmed_identity, {})
      res.save!

      self.activated = true
      self.settings['room_id'] = res.id
      self.settings['identity'] = identity
      self.settings['activated_at'] = Time.now.iso8601
      self.settings['room_code'] = res.code
      self.save
      if self.settings['partner_checked']
        res.settings['partner_status'] = 'pending_waiting_room'
      end
      res.settings['name'] = self.settings['name']
      res.settings['pending_room_id'] = self.id
      res.save
      if self.settings['partner_params']
        res.user_accessed(self.settings['partner_params']['pending_id'], self.settings['partner_params'])
      end
    end
    {identity: identity, room: res}
  end


  def attendee_code
    if !self.settings['nonce']
      self.generate_defaults
      self.save
    end
    ['p', self.id.to_s, Account.hex_shortened(GoSecure.sha512("#{self.id}#{self.settings['nonce']}", "attendee_code"))[0, 50]].join('x')
  end

  def self.find_by_attendee_code(code)
    p, id, sha = code.split(/x/, 3)
    pending_room = PendingRoom.find_by(code: code)
    if !pending_room
      pending_room ||= PendingRoom.find_by(id: id)
      pending_room = nil if pending_room && code != pending_room.attendee_code
    end
    pending_room
  end

  def self.generate(account, params)
    pending_room = PendingRoom.new(account: account)
    pending_room.generate_defaults
    code = GoSecure.sha512(account.id.to_s, 'account_id_sha')[0, 3] + GoSecure.sha512([GoSecure.nonce('pending_room_code'), Time.now.iso8601, rand(999999)].join('-'), 'pending_room_id')[0, 64]
    code = 'p' + code
    pending_room.code = code
    pending_room.settings['start_at'] = Time.parse(params['start_at']).utc.iso8601
    pending_room.settings['name'] = params['name']
    pending_room.settings['as_communicator'] = params['as_communicator'] == 'true'
    pending_room.save
    pending_room
  end

  def self.flush_rooms
    PendingRoom.where(activated: true).where(['created_at < ?', 60.days.ago]).delete_all
    # TODO: also delete rooms whose schedule has passed but were never activated
  end
end
