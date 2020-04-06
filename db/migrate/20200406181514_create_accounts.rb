class CreateAccounts < ActiveRecord::Migration[5.2]
  def change
    create_table :accounts do |t|
      t.string :code
      t.text :settings
      t.timestamps
    end
  end
end
