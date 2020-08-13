class Bundle < ApplicationRecord
  include SecureSerialize
  secure_serialize :settings

  before_save :generate_defaults

  def generate_defaults
    self.settings ||= {}
    self.settings['name'] ||= "Unnamed Bundle"
    self.uses ||= 0
    self.approved ||= false
    self.verifier ||= GoSecure.nonce('bundle_verifier')[0, 10]
    true
  end

  def code
    stub = self.settings['name'].downcase.gsub(/[^A-Za-z0-9]+/, '-')[0, 30] 
    "#{self.id}x#{self.verifier}-#{stub}"
  end

  def self.find_by_code(str)
    return nil unless str
    # add plug to url for friendlier urls
    id, verifier = (str.split(/-/)[0] || '').split(/x/)
    # Bundles that haven't been accessed for over a year should be removed
    Bundle.where(['updated_at < ?', 14.months.ago]).delete_all
    return nil unless id && verifier
    bundle = self.find_by(id: id)
    return nil unless bundle && bundle.verifier == verifier
    bundle.touch if bundle
    return bundle
  end

  def self.generate(params)
    bundle = Bundle.new
    bundle.settings ||= {}
    bundle.settings['name'] = params['name']
    bundle.settings['author'] = params['author']
    bundle.settings['content'] = params['content']
    bundle.settings['description'] = params['description']
    bundle.save
    bundle
  end
end
